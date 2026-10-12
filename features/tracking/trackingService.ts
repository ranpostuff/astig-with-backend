import {
  get,
  onValue,
  push,
  ref,
  runTransaction,
  set,
  update,
  type Unsubscribe,
} from "firebase/database";

import { firebaseAuth, firebaseDatabase } from "../../lib/firebase";
import type {
  DailyAttendanceRecord,
  FirebaseStudentRecord,
  ImportSummary,
  ScanResult,
  StudentImportRow,
  ViolationRecord,
} from "./types";

const SCHOOL_TIME_ZONE = "Asia/Manila";
const LATE_HOUR = 7;
const LATE_MINUTE = 15;

function schoolDateParts(timestamp = Date.now()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHOOL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(timestamp))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function isLate(timestamp: number) {
  const { hour, minute } = schoolDateParts(timestamp);
  return hour > LATE_HOUR || (hour === LATE_HOUR && minute > LATE_MINUTE);
}

function fullName(student: FirebaseStudentRecord) {
  return [
    student.firstName,
    student.middleName,
    student.lastName,
    student.extension,
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function parseStudentName(value: string) {
  const cleaned = normalizeName(value);
  const parts = cleaned.split(",").map((part) => part.trim()).filter(Boolean);
  const surnamePart = parts.shift() || "Unknown";
  const firstName = parts.shift() || "Unknown";
  const middleName = parts.length ? parts.join(", ") : null;

  return {
    lastName: surnamePart || "Unknown",
    firstName,
    middleName,
  };
}

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function getStudent(lrn: string) {
  const snapshot = await get(ref(firebaseDatabase, `studentDirectory/${lrn}`));
  return snapshot.exists() ? (snapshot.val() as FirebaseStudentRecord) : null;
}

export const trackingService = {
  schoolDateKey(timestamp = Date.now()) {
    return schoolDateParts(timestamp).dateKey;
  },

  async listStudents() {
    const snapshot = await get(ref(firebaseDatabase, "students"));
    if (!snapshot.exists()) return [] as FirebaseStudentRecord[];
    return Object.values(snapshot.val() as Record<string, FirebaseStudentRecord>).sort(
      (a, b) => a.lastName.localeCompare(b.lastName),
    );
  },

  async listSections() {
    const snapshot = await get(ref(firebaseDatabase, "sections"));
    if (!snapshot.exists()) return [] as Array<Record<string, unknown>>;
    return Object.values(snapshot.val() as Record<string, Record<string, unknown>>);
  },

  subscribeAttendance(
    dateKey: string,
    callback: (records: Record<string, DailyAttendanceRecord>) => void,
  ): Unsubscribe {
    return onValue(ref(firebaseDatabase, `attendance/${dateKey}`), (snapshot) => {
      callback(
        snapshot.exists()
          ? (snapshot.val() as Record<string, DailyAttendanceRecord>)
          : {},
      );
    });
  },

  subscribeViolations(
    callback: (records: ViolationRecord[]) => void,
  ): Unsubscribe {
    return onValue(ref(firebaseDatabase, "violationEvents"), (snapshot) => {
      const records = snapshot.exists()
        ? Object.values(snapshot.val() as Record<string, ViolationRecord>)
        : [];
      callback(records.sort((a, b) => b.occurredAt - a.occurredAt));
    });
  },

  async recordAttendance(lrnValue: string, source: "KIOSK" | "MOBILE") {
    const lrn = lrnValue.trim();
    const student = await getStudent(lrn);
    if (!student) throw new Error(`No student was found for LRN ${lrn}.`);

    const timestamp = Date.now();
    const dateKey = schoolDateParts(timestamp).dateKey;
    let action: "ENTRY" | "EXIT" = "ENTRY";
    const attendanceRef = ref(firebaseDatabase, `attendance/${dateKey}/${lrn}`);
    const transaction = await runTransaction(attendanceRef, (current) => {
      if (!current) {
        const late = isLate(timestamp);
        action = "ENTRY";
        return {
          lrn,
          studentName: fullName(student),
          sectionId: student.sectionId,
          sectionName: student.sectionName,
          gradeName: student.gradeName,
          entryAt: timestamp,
          exitAt: null,
          lastScanAt: timestamp,
          status: late ? "LATE" : "ON_TIME",
          late,
        } satisfies DailyAttendanceRecord;
      }

      action = "EXIT";
      return { ...current, exitAt: timestamp, lastScanAt: timestamp };
    });

    if (!transaction.committed || !transaction.snapshot.exists()) {
      throw new Error("The attendance record could not be saved.");
    }

    const attendance = transaction.snapshot.val() as DailyAttendanceRecord;
    const eventRef = push(ref(firebaseDatabase, "attendanceEvents"));
    await set(eventRef, {
      id: eventRef.key,
      lrn,
      action,
      source,
      dateKey,
      occurredAt: timestamp,
      studentName: fullName(student),
      sectionId: student.sectionId,
      recordedByUid: firebaseAuth.currentUser?.uid || "unknown",
    });

    return { action, student, attendance } satisfies ScanResult;
  },

  async recordViolation(
    lrnValue: string,
    type: string,
    notes: string,
    recordedByName: string,
  ) {
    const lrn = lrnValue.trim();
    const student = await getStudent(lrn);
    if (!student) throw new Error(`No student was found for LRN ${lrn}.`);
    if (!type.trim()) throw new Error("Choose a violation before saving.");

    const eventRef = push(ref(firebaseDatabase, "violationEvents"));
    const record: ViolationRecord = {
      id: eventRef.key || crypto.randomUUID(),
      lrn,
      studentName: fullName(student),
      sectionId: student.sectionId,
      sectionName: student.sectionName,
      type: type.trim(),
      notes: notes.trim() || null,
      occurredAt: Date.now(),
      recordedByUid: firebaseAuth.currentUser?.uid || "unknown",
      recordedByName,
    };

    await update(ref(firebaseDatabase), {
      [`violationEvents/${record.id}`]: record,
      [`violations/${lrn}/${record.id}`]: record,
    });
    return { student, violation: record };
  },

  async createScanSession(code: string) {
    await set(ref(firebaseDatabase, `scanSessions/${code}`), {
      code,
      createdAt: Date.now(),
      createdByUid: firebaseAuth.currentUser?.uid || "unknown",
      active: true,
    });
  },

  subscribeScanSession(
    code: string,
    callback: (value: Record<string, unknown> | null) => void,
  ) {
    return onValue(ref(firebaseDatabase, `scanSessions/${code}`), (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() : null);
    });
  },

  async sendRemoteScan(code: string, lrn: string, mode: "ATTENDANCE" | "VIOLATION") {
    await update(ref(firebaseDatabase, `scanSessions/${code}`), {
      pendingScan: {
        id: crypto.randomUUID(),
        lrn: lrn.trim(),
        mode,
        scannedAt: Date.now(),
        scannedByUid: firebaseAuth.currentUser?.uid || "unknown",
      },
    });
  },

  async acknowledgeRemoteScan(code: string, result: Record<string, unknown>) {
    await update(ref(firebaseDatabase, `scanSessions/${code}`), {
      pendingScan: null,
      lastResult: { ...result, acknowledgedAt: Date.now() },
    });
  },

  async importStudents(
    rows: StudentImportRow[],
    defaults: { grade: string; section: string },
  ): Promise<ImportSummary> {
    const [sectionsSnapshot, gradesSnapshot] = await Promise.all([
      get(ref(firebaseDatabase, "sections")),
      get(ref(firebaseDatabase, "grades")),
    ]);
    const existingSections = (sectionsSnapshot.exists()
      ? sectionsSnapshot.val()
      : {}) as Record<string, Record<string, unknown>>;
    const existingGrades = (gradesSnapshot.exists()
      ? gradesSnapshot.val()
      : {}) as Record<string, Record<string, unknown>>;
    type LookupRecord = { key: string; id: number; name: string; [key: string]: unknown };
    const sectionByName = new Map<string, LookupRecord>(
      Object.entries(existingSections).map(([key, value]) => [
        String(value.name || "").toLowerCase(),
        { key, ...value } as LookupRecord,
      ]),
    );
    const gradeByName = new Map<string, LookupRecord>(
      Object.entries(existingGrades).map(([key, value]) => [
        String(value.name || "").toLowerCase(),
        { key, ...value } as LookupRecord,
      ]),
    );
    const updates: Record<string, unknown> = {};
    const summary: ImportSummary = {
      imported: 0,
      createdSections: 0,
      createdGrades: 0,
      skipped: [],
    };

    for (const [index, row] of rows.entries()) {
      const lrn = String(row.lrn || "").replace(/\D/g, "");
      if (!/^\d{12}$/.test(lrn)) {
        summary.skipped.push({ row: index + 2, reason: "LRN must contain 12 digits." });
        continue;
      }
      if (!row.studentName?.trim()) {
        summary.skipped.push({ row: index + 2, reason: "Student name is missing." });
        continue;
      }

      const gradeName = normalizeName(row.grade || defaults.grade || "Unassigned Grade");
      const sectionName = normalizeName(row.section || defaults.section || "Unassigned Section");
      let grade: LookupRecord | undefined = gradeByName.get(gradeName.toLowerCase());
      if (!grade) {
        const id = Date.now() + gradeByName.size;
        const key = String(id);
        grade = { key, id, name: gradeName, description: null, createdAt: Date.now() };
        gradeByName.set(gradeName.toLowerCase(), grade);
        updates[`grades/${key}`] = grade;
        summary.createdGrades += 1;
      }

      let section: LookupRecord | undefined = sectionByName.get(sectionName.toLowerCase());
      if (!section) {
        const id = Date.now() + 1000 + sectionByName.size;
        const key = String(id);
        section = {
          key,
          id,
          name: sectionName,
          gradeId: Number(grade.id),
          gradeName,
          assignedTeacherId: "",
          assignedTeacherName: "Unassigned",
          slug: slug(sectionName),
        };
        sectionByName.set(sectionName.toLowerCase(), section);
        updates[`sections/${key}`] = section;
        summary.createdSections += 1;
      }

      const parsed = parseStudentName(row.studentName);
      const timestamp = Date.now();
      const student: FirebaseStudentRecord = {
        id: Number(lrn),
        lrn,
        firstName: parsed.firstName,
        middleName: parsed.middleName,
        lastName: parsed.lastName,
        extension: null,
        parentName: normalizeName(row.parentName || "") || null,
        parentMobileNo: normalizeName(row.parentPhone || ""),
        parentEmail: normalizeName(row.parentEmail || "") || null,
        studentPicUrl: null,
        sectionId: Number(section.id),
        sectionName,
        gradeId: Number(grade.id),
        gradeName,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      updates[`students/${lrn}`] = student;
      updates[`studentDirectory/${lrn}`] = {
        id: student.id,
        lrn: student.lrn,
        firstName: student.firstName,
        middleName: student.middleName,
        lastName: student.lastName,
        extension: student.extension,
        studentPicUrl: student.studentPicUrl,
        sectionId: student.sectionId,
        sectionName: student.sectionName,
        gradeId: student.gradeId,
        gradeName: student.gradeName,
        createdAt: student.createdAt,
        updatedAt: student.updatedAt,
        parentName: null,
        parentMobileNo: "",
        parentEmail: null,
      } satisfies FirebaseStudentRecord;
      summary.imported += 1;
    }

    if (summary.imported) await update(ref(firebaseDatabase), updates);
    return summary;
  },
};
