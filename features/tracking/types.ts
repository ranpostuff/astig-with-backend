export type AttendanceStatus = "ON_TIME" | "LATE";
export type ScanAction = "ENTRY" | "EXIT";

export interface GradeOption {
  id: number;
  name: string;
}

export interface SectionOption {
  id: number;
  name: string;
  gradeId: number;
  gradeName: string;
  assignedTeacherId?: string;
  assignedTeacherName?: string;
}

export interface FirebaseStudentRecord {
  id: number;
  lrn: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  extension: string | null;
  parentName: string | null;
  parentMobileNo: string;
  parentEmail: string | null;
  studentPicUrl: string | null;
  sectionId: number;
  sectionName: string;
  gradeId: number;
  gradeName: string;
  createdAt: number;
  updatedAt: number;
}

export interface DailyAttendanceRecord {
  lrn: string;
  studentName: string;
  sectionId: number;
  sectionName: string;
  gradeName: string;
  entryAt: number;
  exitAt: number | null;
  lastScanAt: number;
  status: AttendanceStatus;
  late: boolean;
}

export interface ViolationRecord {
  id: string;
  lrn: string;
  studentName: string;
  sectionId: number;
  sectionName: string;
  type: string;
  notes: string | null;
  occurredAt: number;
  recordedByUid: string;
  recordedByName: string;
}

export interface StudentImportRow {
  sourceRow?: number;
  lrn: string;
  studentName: string;
  parentName?: string;
  parentEmail?: string;
  parentPhone?: string;
  grade?: string;
  section?: string;
}

export interface ImportSummary {
  imported: number;
  createdSections: number;
  createdGrades: number;
  skipped: Array<{ row: number; reason: string }>;
}

export interface ScanResult {
  action: ScanAction;
  student: FirebaseStudentRecord;
  attendance: DailyAttendanceRecord;
}
