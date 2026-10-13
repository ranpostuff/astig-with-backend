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
  GradeOption,
  ImportSummary,
  ScanResult,
  SectionOption,
  StudentImportRow,
  ViolationRecord,
} from "./types";

const SCHOOL_TIME_ZONE = "Asia/Manila";
const LATE_HOUR = 7;
const LATE_MINUTE = 15;
const DUPLICATE_SCAN_COOLDOWN_MS = 10_000;

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
  return hour > LATE_HOUR || (hour === LATE_HOUR && minute >= LATE_MINUTE);
}

function reliableTimestamp() {
  // Avoid reading Firebase's reserved `.info/serverTimeOffset` location here.
  // Some transports submit it as a normal server path, which is rejected as
  // "Invalid token in path". Rules already allow a small clock tolerance.
  return Date.now();
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

function normalizeLrn(value: string) {
  const trimmed = value.trim();
  if (/^\d{12}$/.test(trimmed)) return trimmed;
  const embedded = trimmed.match(/(?:^|\D)(\d{12})(?:\D|$)/)?.[1];
  if (embedded) return embedded;
  throw new Error("That QR code does not contain a valid 12-digit student LRN.");
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

async function getStudent(lrn: string) {
  const snapshot = await get(ref(firebaseDatabase, `studentDirectory/${lrn}`));
  if (!snapshot.exists()) return null;
  const student = snapshot.val() as FirebaseStudentRecord & { profilePictureUrl?: string; studentProfilePic?: string };
  return { ...student, studentPicUrl: student.studentPicUrl || student.profilePictureUrl || student.studentProfilePic || null };
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

  async listGrades() {
    const snapshot = await get(ref(firebaseDatabase, "grades"));
    if (!snapshot.exists()) return [] as GradeOption[];
    return Object.values(snapshot.val() as Record<string, GradeOption>).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
  },

  async listSections() {
    const snapshot = await get(ref(firebaseDatabase, "sections"));
    if (!snapshot.exists()) return [] as SectionOption[];
    return Object.values(snapshot.val() as Record<string, SectionOption>).sort((a, b) =>
      a.gradeName.localeCompare(b.gradeName, undefined, { numeric: true }) || a.name.localeCompare(b.name),
    );
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
    const lrn = normalizeLrn(lrnValue);
    const student = await getStudent(lrn);
    if (!student) throw new Error(`No student was found for LRN ${lrn}.`);

    const timestamp = reliableTimestamp();
    const dateKey = schoolDateParts(timestamp).dateKey;
    let action: "ENTRY" | "EXIT" = "ENTRY";
    let duplicateScan = false;
    let waitSeconds = 10;
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

      const elapsed = timestamp - Number(current.lastScanAt || current.entryAt || 0);
      if (elapsed >= 0 && elapsed < DUPLICATE_SCAN_COOLDOWN_MS) {
        duplicateScan = true;
        waitSeconds = Math.max(1, Math.ceil((DUPLICATE_SCAN_COOLDOWN_MS - elapsed) / 1000));
        return;
      }

      action = "EXIT";
      return { ...current, exitAt: timestamp, lastScanAt: timestamp };
    });

    if (duplicateScan) {
      throw new Error(`SCAN REJECTED — PLEASE WAIT ${waitSeconds} SECOND${waitSeconds === 1 ? "" : "S"}.`);
    }
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
    const lrn = normalizeLrn(lrnValue);
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
    const createdAt = Date.now();
    await update(ref(firebaseDatabase), {
      [`scanSessions/${code}`]: {
        code,
        createdAt,
        createdByUid: firebaseAuth.currentUser?.uid || "unknown",
        active: true,
      },
      "scanSessions/ACTIVE": {
        code: "ACTIVE",
        activeCode: code,
        createdAt,
        active: true,
      },
    });
  },

  async closeScanSession(code: string) {
    await update(ref(firebaseDatabase, `scanSessions/${code}`), {
      active: false,
      closedAt: Date.now(),
    });
    const activeSnapshot = await get(ref(firebaseDatabase, "scanSessions/ACTIVE"));
    if (activeSnapshot.exists() && activeSnapshot.val().activeCode === code) {
      await update(ref(firebaseDatabase, "scanSessions/ACTIVE"), {
        active: false,
        closedAt: Date.now(),
      });
    }
  },

  async findLatestActiveScanSession() {
    const snapshot = await get(ref(firebaseDatabase, "scanSessions/ACTIVE"));
    if (!snapshot.exists()) return null;
    const session = snapshot.val() as {
      activeCode?: string;
      active?: boolean;
      createdAt?: number;
    };
    const cutoff = Date.now() - 12 * 60 * 60 * 1000;
    if (!session.active || !session.activeCode || Number(session.createdAt || 0) < cutoff) return null;
    return session.activeCode;
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
    target: { gradeId: number; gradeName: string; sectionId: number; sectionName: string },
  ): Promise<ImportSummary> {
    const [sectionSnapshot, gradeSnapshot, studentsSnapshot] = await Promise.all([
      get(ref(firebaseDatabase, `sections/${target.sectionId}`)),
      get(ref(firebaseDatabase, `grades/${target.gradeId}`)),
      get(ref(firebaseDatabase, "students")),
    ]);
    if (!gradeSnapshot.exists()) throw new Error("The selected grade no longer exists.");
    if (!sectionSnapshot.exists()) throw new Error("The selected section no longer exists.");
    const sectionRecord = sectionSnapshot.val() as { gradeId?: number };
    if (Number(sectionRecord.gradeId) !== target.gradeId) {
      throw new Error("The selected section does not belong to the selected grade.");
    }
    const updates: Record<string, unknown> = {};
    const usedLrns = new Set(
      studentsSnapshot.exists()
        ? Object.keys(studentsSnapshot.val() as Record<string, FirebaseStudentRecord>)
        : [],
    );
    const summary: ImportSummary = {
      imported: 0,
      createdSections: 0,
      createdGrades: 0,
      skipped: [],
    };

    for (const [index, row] of rows.entries()) {
      const lrn = String(row.lrn || "").replace(/\D/g, "");
      if (!/^\d{12}$/.test(lrn)) {
        summary.skipped.push({ row: row.sourceRow || index + 2, reason: "LRN must contain 12 digits." });
        continue;
      }
      if (!row.studentName?.trim()) {
        summary.skipped.push({ row: row.sourceRow || index + 2, reason: "Student name is missing." });
        continue;
      }
      if (usedLrns.has(lrn)) {
        summary.skipped.push({ row: row.sourceRow || index + 2, reason: "This LRN already exists or is duplicated in the file." });
        continue;
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
        sectionId: target.sectionId,
        sectionName: target.sectionName,
        gradeId: target.gradeId,
        gradeName: target.gradeName,
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
      usedLrns.add(lrn);
      summary.imported += 1;
    }

    if (summary.imported) await update(ref(firebaseDatabase), updates);
    return summary;
  },
};
