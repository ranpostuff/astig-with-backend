import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";

initializeApp();

const REGION = "asia-southeast1";
const TIME_ZONE = "Asia/Manila";
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const RESEND_FROM_EMAIL = defineString("RESEND_FROM_EMAIL", {
  default: "ASTIG Attendance <onboarding@resend.dev>",
});

type SectionRecord = {
  id: number;
  name: string;
  gradeName: string;
  assignedTeacherId: string;
  assignedTeacherName?: string;
};

type TeacherRecord = {
  id: string;
  email: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
};

type StudentRecord = {
  lrn: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  extension?: string | null;
  sectionId: number;
};

type AttendanceRecord = {
  entryAt?: number | null;
  exitAt?: number | null;
  late?: boolean;
};

type ReportRequest = {
  dateKey?: string;
  sectionId?: number;
  gradeName?: string;
};

function schoolDateKey(timestamp = Date.now()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(timestamp)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatTime(timestamp?: number | null) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(timestamp));
}

function fullName(student: StudentRecord) {
  return [student.lastName + ",", student.firstName, student.middleName, student.extension].filter(Boolean).join(" ");
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  filename: string;
  csv: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY.value()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL.value(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      attachments: [{
        filename: input.filename,
        content: Buffer.from(input.csv, "utf8").toString("base64"),
      }],
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend rejected the email (${response.status}): ${detail}`);
  }
  return response.json() as Promise<{ id?: string }>;
}

async function sendAttendanceReports(input: ReportRequest & { teacherId?: string }) {
  const dateKey = input.dateKey || schoolDateKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new HttpsError("invalid-argument", "Use a valid YYYY-MM-DD date.");

  const db = getDatabase();
  const [sectionsSnapshot, teachersSnapshot, studentsSnapshot, attendanceSnapshot] = await Promise.all([
    db.ref("sections").get(),
    db.ref("teachers").get(),
    db.ref("students").get(),
    db.ref(`attendance/${dateKey}`).get(),
  ]);
  const sections = Object.values((sectionsSnapshot.val() || {}) as Record<string, SectionRecord>);
  const teachers = (teachersSnapshot.val() || {}) as Record<string, TeacherRecord>;
  const students = Object.values((studentsSnapshot.val() || {}) as Record<string, StudentRecord>);
  const attendance = (attendanceSnapshot.val() || {}) as Record<string, AttendanceRecord>;

  const targets = sections.filter((section) =>
    (!input.sectionId || Number(section.id) === Number(input.sectionId)) &&
    (!input.gradeName || section.gradeName === input.gradeName) &&
    (!input.teacherId || section.assignedTeacherId === input.teacherId),
  );
  const result = { sent: 0, skipped: [] as string[], emailIds: [] as string[] };

  for (const section of targets) {
    const teacher = teachers[section.assignedTeacherId];
    if (!teacher?.email) {
      result.skipped.push(`${section.gradeName} - ${section.name}: adviser email is missing.`);
      continue;
    }
    const sectionStudents = students
      .filter((student) => Number(student.sectionId) === Number(section.id))
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
    const reportRows = sectionStudents.map((student) => {
      const record = attendance[student.lrn];
      return {
        student: fullName(student),
        lrn: student.lrn,
        entry: formatTime(record?.entryAt),
        exit: formatTime(record?.exitAt),
        remarks: !record?.entryAt ? "ABSENT" : record.late ? "LATE" : "ON TIME",
      };
    });
    const csv = [
      ["Student", "LRN", "Entry Time", "Exit Time", "Remarks"].map(csvCell).join(","),
      ...reportRows.map((row) => [row.student, row.lrn, row.entry, row.exit, row.remarks].map(csvCell).join(",")),
    ].join("\r\n");
    const bodyRows = reportRows.map((row) => `<tr><td>${escapeHtml(row.student)}</td><td>${escapeHtml(row.entry)}</td><td>${escapeHtml(row.exit)}</td><td><strong>${escapeHtml(row.remarks)}</strong></td></tr>`).join("");
    const teacherName = [teacher.firstName, teacher.middleName, teacher.lastName].filter(Boolean).join(" ");
    const html = `<div style="font-family:Arial,sans-serif;color:#1e293b"><h2 style="color:#881337">ASTIG Attendance Report</h2><p>Good day, ${escapeHtml(teacherName || "Teacher")}.</p><p><strong>${escapeHtml(section.gradeName)} – ${escapeHtml(section.name)}</strong><br>Date: ${escapeHtml(dateKey)}</p><table style="border-collapse:collapse;width:100%"><thead><tr style="background:#881337;color:#fff"><th style="padding:8px;text-align:left">Student</th><th style="padding:8px;text-align:left">Entry</th><th style="padding:8px;text-align:left">Exit</th><th style="padding:8px;text-align:left">Remarks</th></tr></thead><tbody>${bodyRows || '<tr><td colspan="4" style="padding:12px">No students are assigned to this section.</td></tr>'}</tbody></table><p style="font-size:12px;color:#64748b">Generated automatically by ASTIG.</p></div>`;

    const response = await sendEmail({
      to: teacher.email,
      subject: `ASTIG Attendance – ${section.gradeName} ${section.name} – ${dateKey}`,
      html,
      filename: `ASTIG-${section.gradeName}-${section.name}-${dateKey}.csv`.replace(/[^a-zA-Z0-9._-]+/g, "-"),
      csv,
    });
    result.sent += 1;
    if (response.id) result.emailIds.push(response.id);
  }

  await db.ref("reportRuns").push({
    dateKey,
    requestedSectionId: input.sectionId || null,
    requestedGradeName: input.gradeName || null,
    requestedTeacherId: input.teacherId || null,
    sent: result.sent,
    skipped: result.skipped,
    createdAt: Date.now(),
  });
  return result;
}

export const sendAttendanceReportNow = onCall(
  { region: REGION, secrets: [RESEND_API_KEY] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in before sending a report.");
    const profileSnapshot = await getDatabase().ref(`users/${request.auth.uid}/role`).get();
    const profileRole = String(profileSnapshot.val() || "");
    const isAdmin = request.auth.token.admin === true || profileRole === "admin";
    const isTeacher = request.auth.token.teacher === true || profileRole === "teacher";
    if (!isAdmin && !isTeacher) throw new HttpsError("permission-denied", "Only administrators and teachers may send reports.");
    const input = (request.data || {}) as ReportRequest;
    return sendAttendanceReports({ ...input, teacherId: isAdmin ? undefined : request.auth.uid });
  },
);

export const sendDailyAttendanceReports = onSchedule(
  {
    region: REGION,
    schedule: "0 12 * * *",
    timeZone: TIME_ZONE,
    secrets: [RESEND_API_KEY],
    retryCount: 2,
  },
  async () => {
    const result = await sendAttendanceReports({ dateKey: schoolDateKey() });
    logger.info("Daily attendance adviser reports complete.", result);
  },
);
