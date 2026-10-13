import * as XLSX from "xlsx";
import type { StudentImportRow } from "../tracking/types";

const aliases: Record<string, string[]> = {
  studentName: ["nameofstudent", "studentname", "learnername", "name", "fullname"],
  firstName: ["firstname", "givenname"],
  lastName: ["lastname", "surname", "familyname"],
  middleName: ["middlename", "middleinitial"],
  parentName: ["nameofparent", "parentname", "guardianname", "nameofguardian"],
  parentEmail: ["emailaddress", "email", "parentemail", "studentemail", "guardianemail"],
  parentPhone: ["phoneno", "phonenoparent", "parentphone", "parentmobileno", "phone", "mobilenumber", "contactnumber"],
  lrn: ["lrn", "learnerreferencenumber"],
  grade: ["grade", "gradelevel"],
  section: ["section", "sectionname"],
};

function field(value: unknown) {
  const label = String(value ?? "").split(/[\r\n]/)[0].replace(/\([^)]*\)/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return Object.keys(aliases).find((key) => aliases[key].includes(label));
}

// Locate a real header row instead of treating titles/instructions as headers.
// Column order and unused columns do not affect the mapping.
export function parseStudentWorkbook(workbook: XLSX.WorkBook): StudentImportRow[] {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const original = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
    const width = original.reduce((max, row) => Math.max(max, row.length), 0);
    const orientations = [original, Array.from({ length: width }, (_, column) => original.map(row => row[column] ?? ""))];
    for (const matrix of orientations) {
    const headerIndex = matrix.findIndex((row) => {
      const fields = row.map(field);
      return fields.includes("lrn") && (fields.includes("studentName") || (fields.includes("firstName") && fields.includes("lastName")));
    });
    if (headerIndex < 0) continue;
    const columns = new Map<string, number>();
    matrix[headerIndex].forEach((cell, column) => {
      const key = field(cell);
      if (!key) return;
      if (columns.has(key)) throw new Error(`Worksheet ${sheetName}: more than one ${key} column was found. Keep one clearly labelled column for each field.`);
      columns.set(key, column);
    });
    const result: StudentImportRow[] = [];
    for (let index = headerIndex + 1; index < matrix.length; index++) {
      const row = matrix[index];
      const read = (key: string) => {
        const column = columns.get(key);
        if (column === undefined) return "";
        const value = row[column];
        if (key === "lrn" && typeof value === "number" && Number.isSafeInteger(value)) return String(value).padStart(12, "0");
        return String(value ?? "").trim();
      };
      const studentName = read("studentName") || [read("lastName"), read("firstName"), read("middleName")].filter(Boolean).join(", ");
      const lrn = read("lrn");
      if (!studentName && !lrn) continue;
      if (field(lrn) === "lrn") continue; // repeated print headers
      result.push({ studentName, lrn, parentName: read("parentName"), parentEmail: read("parentEmail"), parentPhone: read("parentPhone"), grade: read("grade"), section: read("section"), sourceRow: matrix === original ? index + 1 : undefined });
    }
    if (result.length) return result;
    }
  }
  throw new Error("No student data found. Include columns named Name of Student and LRN (or First Name, Last Name and LRN). Email is optional; columns may be in any order.");
}
