import { useMemo, useState } from "react";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import * as XLSX from "xlsx";

import { trackingService } from "../../tracking/trackingService";
import type { StudentImportRow } from "../../tracking/types";
import { toastService } from "../../../app/services/toastService";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
};

type RawRow = Record<string, unknown>;

function pick(row: RawRow, names: string[]) {
  const entries = Object.entries(row);
  const match = entries.find(([key]) =>
    names.includes(key.trim().toLowerCase().replace(/[^a-z0-9]/g, "")),
  );
  return match?.[1] == null ? "" : String(match[1]).trim();
}

function mapRow(row: RawRow): StudentImportRow {
  return {
    studentName: pick(row, ["nameofstudent", "studentname", "name"]),
    parentName: pick(row, ["nameofparent", "parentname", "guardianname"]),
    parentEmail: pick(row, ["emailaddress", "email", "parentemail"]),
    parentPhone: pick(row, ["phonenoparent", "parentphone", "parentmobileno", "phone"]),
    lrn: pick(row, ["lrn", "learnerreferencenumber"]),
    grade: pick(row, ["grade", "gradelevel"]),
    section: pick(row, ["section", "sectionname"]),
  };
}

export function StudentImportModal({ isOpen, onClose, onImported }: Props) {
  const [rows, setRows] = useState<StudentImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [grade, setGrade] = useState("");
  const [section, setSection] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  if (!isOpen) return null;

  async function handleFile(file?: File) {
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json<RawRow>(firstSheet, { defval: "" });
      const mapped = parsed.map(mapRow).filter((row) => row.studentName || row.lrn);
      setRows(mapped);
      setFileName(file.name);
      if (!mapped.length) throw new Error("No student rows were found in the first worksheet.");
    } catch (error) {
      setRows([]);
      setFileName("");
      toastService.error(error);
    }
  }

  async function handleImport() {
    if (!rows.length) return;
    if (!grade.trim() || !section.trim()) {
      toastService.error("Enter a default grade and section for rows that do not contain them.");
      return;
    }
    setIsImporting(true);
    try {
      const summary = await trackingService.importStudents(rows, { grade, section });
      toastService.success(
        `${summary.imported} students imported. ${summary.createdSections} sections created.`,
      );
      if (summary.skipped.length) {
        toastService.error(`${summary.skipped.length} rows were skipped because they were incomplete.`);
      }
      onImported();
      onClose();
      setRows([]);
      setFileName("");
    } catch (error) {
      toastService.error(error);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 p-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Import students from Excel</h2>
            <p className="mt-1 text-sm text-slate-500">
              Accepted columns: Name of Student, Name of Parent, Email Address, Phone No. (Parent), LRN, Grade, and Section.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-rose-200 bg-rose-50/50 px-6 py-8 text-center hover:border-rose-400">
            <FileSpreadsheet className="h-10 w-10 text-rose-800" />
            <span className="mt-3 font-semibold text-slate-800">{fileName || "Choose an Excel or CSV file"}</span>
            <span className="mt-1 text-xs text-slate-500">.xlsx, .xls, or .csv</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(event) => void handleFile(event.target.files?.[0])} />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Default grade
              <input value={grade} onChange={(event) => setGrade(event.target.value)} placeholder="e.g. Grade 11" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-rose-700" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Default section
              <input value={section} onChange={(event) => setSection(event.target.value)} placeholder="e.g. STEM A" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-rose-700" />
            </label>
          </div>

          {preview.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">LRN</th><th className="px-4 py-3">Parent</th><th className="px-4 py-3">Section</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.map((row, index) => (
                    <tr key={`${row.lrn}-${index}`}><td className="px-4 py-3 font-medium text-slate-800">{row.studentName}</td><td className="px-4 py-3">{row.lrn}</td><td className="px-4 py-3">{row.parentName || "—"}</td><td className="px-4 py-3">{row.section || section || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">Showing {preview.length} of {rows.length} rows.</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 p-6">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" disabled={!rows.length || isImporting} onClick={() => void handleImport()} className="inline-flex items-center gap-2 rounded-lg bg-rose-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-900 disabled:opacity-50">
            <Upload className="h-4 w-4" />{isImporting ? "Importing..." : `Import ${rows.length || ""} students`}
          </button>
        </div>
      </div>
    </div>
  );
}
