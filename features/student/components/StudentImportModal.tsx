import { useMemo, useState } from "react";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import * as XLSX from "xlsx";
import { parseStudentWorkbook } from "../studentImport";

import { trackingService } from "../../tracking/trackingService";
import type { StudentImportRow } from "../../tracking/types";
import { toastService } from "../../../app/services/toastService";
import { useGrades } from "../../grades/hooks/useGrades";
import { useSections } from "../../sections/hooks/useSections";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
};

export function StudentImportModal({ isOpen, onClose, onImported }: Props) {
  const [rows, setRows] = useState<StudentImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const preview = useMemo(() => rows.slice(0, 5), [rows]);
  const { data: gradesData, isLoading: isLoadingGrades } = useGrades({
    pageNumber: 1,
    pageSize: 100,
  });
  const grades = gradesData?.results ?? [];
  const selectedGrade = grades.find((item) => String(item.id) === gradeId);
  const { data: sectionsData, isLoading: isLoadingSections } = useSections(
    {
      pageNumber: 1,
      pageSize: 100,
      ...(selectedGrade ? { gradeId: selectedGrade.id } : {}),
    },
    Boolean(selectedGrade),
  );
  const sections = sectionsData?.results ?? [];
  const selectedSection = sections.find((item) => String(item.id) === sectionId);

  if (!isOpen) return null;

  async function handleFile(file?: File) {
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const mapped = parseStudentWorkbook(workbook);
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
    if (!selectedGrade || !selectedSection) {
      toastService.error("Select the grade and section where these students should be imported.");
      return;
    }
    setIsImporting(true);
    try {
      const summary = await trackingService.importStudents(rows, {
        gradeId: selectedGrade.id,
        gradeName: selectedGrade.name,
        sectionId: selectedSection.id,
        sectionName: selectedSection.name,
      });
      toastService.success(
        `${summary.imported} students imported to ${selectedGrade.name} – ${selectedSection.name}.`,
      );
      if (summary.skipped.length) {
        const firstReason = summary.skipped[0]?.reason;
        toastService.error(`${summary.skipped.length} row${summary.skipped.length === 1 ? " was" : "s were"} skipped.${firstReason ? ` First issue: ${firstReason}` : ""}`);
      }
      onImported();
      onClose();
      setRows([]);
      setFileName("");
      setGradeId("");
      setSectionId("");
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
            <p className="mt-1 text-sm text-slate-500">Choose a file, then select an existing grade and section. Name of Student and LRN are required. Email is optional. Columns may be in any order; title rows and extra columns are ignored.</p>
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
              Grade
              <select value={gradeId} onChange={(event) => { setGradeId(event.target.value); setSectionId(""); }} disabled={isLoadingGrades} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-rose-700 disabled:bg-slate-100">
                <option value="">{isLoadingGrades ? "Loading grades..." : "Select a grade"}</option>
                {grades.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Section
              <select value={sectionId} onChange={(event) => setSectionId(event.target.value)} disabled={!selectedGrade || isLoadingSections} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-rose-700 disabled:bg-slate-100">
                <option value="">{!selectedGrade ? "Select a grade first" : isLoadingSections ? "Loading sections..." : "Select a section"}</option>
                {sections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>

          {preview.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">LRN</th><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Section</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.map((row, index) => (
                    <tr key={`${row.lrn}-${index}`}><td className="px-4 py-3 font-medium text-slate-800">{row.studentName}</td><td className="px-4 py-3">{row.lrn}</td><td className="px-4 py-3">{selectedGrade?.name || "—"}</td><td className="px-4 py-3">{selectedSection?.name || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">Showing {preview.length} of {rows.length} rows.</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 p-6">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" disabled={!rows.length || !selectedGrade || !selectedSection || isImporting} onClick={() => void handleImport()} className="inline-flex items-center gap-2 rounded-lg bg-rose-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-50">
            <Upload className="h-4 w-4" />{isImporting ? "Importing..." : `Import ${rows.length || ""} students`}
          </button>
        </div>
      </div>
    </div>
  );
}
