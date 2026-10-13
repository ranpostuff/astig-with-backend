import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

const TIME_ZONE = "Asia/Manila";
const DEPLOYMENT_VERSION = "brevo-attendance-api-2026-10-13.1";

type RequestLike = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ResponseLike = {
  status(code: number): ResponseLike;
  json(value: unknown): void;
  setHeader(name: string, value: string): void;
};

type SectionRecord = {
  id: number;
  name: string;
  gradeName: string;
  assignedTeacherId?: string;
};

type TeacherRecord = {
  email?: string;
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
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

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured in Vercel.`);
  return value;
}

function initializeFirebaseAdmin() {
  if (getApps().length) return;
  initializeApp({
    credential: cert({
      projectId: requiredEnvironment("FIREBASE_PROJECT_ID"),
      clientEmail: requiredEnvironment("FIREBASE_CLIENT_EMAIL"),
      privateKey: requiredEnvironment("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
    databaseURL: requiredEnvironment("FIREBASE_DATABASE_URL"),
  });
}

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

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function studentName(student: StudentRecord) {
  return [student.lastName + ",", student.firstName, student.middleName, student.extension].filter(Boolean).join(" ");
}

function requestBody(body: unknown): ReportRequest {
  if (!body) return {};
  if (typeof body === "string") return JSON.parse(body) as ReportRequest;
  return body as ReportRequest;
}

async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  filename: string;
  csv: string;
}) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "api-key": requiredEnvironment("BREVO_API_KEY"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: requiredEnvironment("BREVO_FROM_NAME"),
        email: requiredEnvironment("BREVO_FROM_EMAIL"),
      },
      to: [{ email: input.to }],
      subject: input.subject,
      htmlContent: input.html,
      attachment: [{
        name: input.filename,
        content: Buffer.from(input.csv, "utf8").toString("base64"),
      }],
      tags: ["astig-attendance"],
    }),
  });
  if (!response.ok) throw new Error(`Brevo rejected an email (${response.status}): ${await response.text()}`);
  const result = await response.json() as { messageId?: string };
  return { id: result.messageId };
}

async function mapWithConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

async function sendReports(input: ReportRequest & { teacherId?: string; scheduled?: boolean }) {
  const dateKey = input.dateKey || schoolDateKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error("Use a valid YYYY-MM-DD date.");

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

  await mapWithConcurrency(targets, 2, async (section) => {
    const teacher = section.assignedTeacherId ? teachers[section.assignedTeacherId] : undefined;
    if (!teacher?.email) {
      result.skipped.push(`${section.gradeName} - ${section.name}: adviser email is missing.`);
      return;
    }
    const deliveryRef = db.ref(`emailReportDeliveries/${dateKey}/${section.id}`);
    if (input.scheduled && (await deliveryRef.get()).val()?.status === "SENT") {
      result.skipped.push(`${section.gradeName} - ${section.name}: today's scheduled report was already sent.`);
      return;
    }
    const rows = students
      .filter((student) => Number(student.sectionId) === Number(section.id))
      .sort((a, b) => a.lastName.localeCompare(b.lastName))
      .map((student) => {
        const record = attendance[student.lrn];
        return {
          student: studentName(student),
          lrn: student.lrn,
          entry: formatTime(record?.entryAt),
          exit: formatTime(record?.exitAt),
          remarks: !record?.entryAt ? "ABSENT" : record.late ? "LATE" : "ON TIME",
        };
      });
    const csv = [
      ["Student", "LRN", "Entry Time", "Exit Time", "Remarks"].map(csvCell).join(","),
      ...rows.map((row) => [row.student, row.lrn, row.entry, row.exit, row.remarks].map(csvCell).join(",")),
    ].join("\r\n");
    const bodyRows = rows.map((row) => `<tr><td>${escapeHtml(row.student)}</td><td>${escapeHtml(row.entry)}</td><td>${escapeHtml(row.exit)}</td><td><strong>${escapeHtml(row.remarks)}</strong></td></tr>`).join("");
    const adviserName = [teacher.firstName, teacher.middleName, teacher.lastName].filter(Boolean).join(" ");
    const html = `<div style="font-family:Arial,sans-serif;color:#1e293b"><h2 style="color:#881337">ASTIG Attendance Report</h2><p>Good day, ${escapeHtml(adviserName || "Teacher")}.</p><p><strong>${escapeHtml(section.gradeName)} – ${escapeHtml(section.name)}</strong><br>Date: ${escapeHtml(dateKey)}</p><table style="border-collapse:collapse;width:100%"><thead><tr style="background:#881337;color:#fff"><th style="padding:8px;text-align:left">Student</th><th style="padding:8px;text-align:left">Entry</th><th style="padding:8px;text-align:left">Exit</th><th style="padding:8px;text-align:left">Remarks</th></tr></thead><tbody>${bodyRows || '<tr><td colspan="4" style="padding:12px">No students are assigned to this section.</td></tr>'}</tbody></table><p style="font-size:12px;color:#64748b">Generated automatically by ASTIG.</p></div>`;
    try {
      const emailResponse = await sendEmail({
        to: teacher.email,
        subject: `ASTIG Attendance – ${section.gradeName} ${section.name} – ${dateKey}`,
        html,
        filename: `ASTIG-${section.gradeName}-${section.name}-${dateKey}.csv`.replace(/[^a-zA-Z0-9._-]+/g, "-"),
        csv,
      });
      result.sent += 1;
      if (emailResponse.id) result.emailIds.push(emailResponse.id);
      await deliveryRef.set({
        status: "SENT",
        messageId: emailResponse.id || null,
        recipient: teacher.email,
        source: input.scheduled ? "VERCEL_CRON" : "MANUAL",
        sentAt: Date.now(),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Brevo could not send this report.";
      result.skipped.push(`${section.gradeName} - ${section.name}: ${reason}`);
    }
  });

  await db.ref("reportRuns").push({
    dateKey,
    source: input.scheduled ? "VERCEL_CRON" : "MANUAL",
    requestedSectionId: input.sectionId || null,
    requestedGradeName: input.gradeName || null,
    requestedTeacherId: input.teacherId || null,
    sent: result.sent,
    skipped: result.skipped,
    createdAt: Date.now(),
  });
  return result;
}

export default async function handler(request: RequestLike, response: ResponseLike) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-ASTIG-Deployment", DEPLOYMENT_VERSION);
  try {
    initializeFirebaseAdmin();
    const authorization = Array.isArray(request.headers.authorization)
      ? request.headers.authorization[0]
      : request.headers.authorization;

    if (request.method === "GET") {
      if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return response.status(401).json({ error: "Unauthorized cron request." });
      }
      const result = await sendReports({ dateKey: schoolDateKey(), scheduled: true });
      return response.status(200).json(result);
    }

    if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed." });
    if (!authorization?.startsWith("Bearer ")) return response.status(401).json({ error: "Sign in before sending a report." });

    const token = await getAuth().verifyIdToken(authorization.slice(7));
    const roleSnapshot = await getDatabase().ref(`users/${token.uid}/role`).get();
    const role = String(roleSnapshot.val() || "");
    const isAdmin = token.admin === true || role === "admin";
    const isTeacher = token.teacher === true || role === "teacher";
    if (!isAdmin && !isTeacher) return response.status(403).json({ error: "Only administrators and teachers may send reports." });

    const result = await sendReports({
      ...requestBody(request.body),
      teacherId: isAdmin ? undefined : token.uid,
      scheduled: false,
    });
    return response.status(200).json(result);
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: error instanceof Error ? error.message : "Unable to send attendance reports." });
  }
}
