import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Eye, Search, ShieldCheck, X } from "lucide-react";
import { trackingService } from "./trackingService";
import type { FirebaseStudentRecord, ViolationRecord } from "./types";

interface StudentViolationHistory {
  student: FirebaseStudentRecord;
  items: ViolationRecord[];
}

function formatManilaDate(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ViolationsPage() {
  const [students, setStudents] = useState<FirebaseStudentRecord[]>([]);
  const [violations, setViolations] = useState<ViolationRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedHistory, setSelectedHistory] = useState<StudentViolationHistory | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    void trackingService.listStudents().then((records) => {
      if (active) setStudents(records);
    }).catch(() => {
      if (active) setLoadError("Student records could not be loaded. Please refresh and try again.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => trackingService.subscribeViolations(setViolations), []);

  useEffect(() => {
    if (!selectedHistory) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedHistory(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedHistory]);

  const rows = useMemo(() => {
    const byLrn = new Map<string, ViolationRecord[]>();
    for (const violation of violations) {
      byLrn.set(violation.lrn, [...(byLrn.get(violation.lrn) || []), violation]);
    }
    for (const items of byLrn.values()) items.sort((a, b) => b.occurredAt - a.occurredAt);

    const term = search.toLowerCase().trim();
    return students
      .map((student) => ({ student, items: byLrn.get(student.lrn) || [] }))
      .filter(({ student }) => !term || `${student.lastName} ${student.firstName} ${student.lrn} ${student.gradeName} ${student.sectionName}`.toLowerCase().includes(term))
      .sort((a, b) => b.items.length - a.items.length || a.student.lastName.localeCompare(b.student.lastName));
  }, [students, violations, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Student records</h1>
        <p className="mt-1 text-sm text-slate-500">Select a student to review their complete violation history.</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, LRN, grade, or section" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3" />
      </div>

      {loadError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Grade and section</th><th className="px-5 py-3">Violations</th><th className="px-5 py-3">Latest record</th><th className="px-5 py-3 text-right">Action</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ student, items }) => {
              const latest = items[0];
              return (
                <tr key={student.lrn} className={items.length ? "bg-amber-50/60" : "hover:bg-slate-50"}>
                  <td className="px-5 py-4"><p className="font-semibold text-slate-900">{student.lastName}, {student.firstName}</p><p className="text-xs text-slate-500">{student.lrn}</p></td>
                  <td className="px-5 py-4 text-slate-600"><p>{student.gradeName}</p><p className="text-xs text-slate-500">{student.sectionName}</p></td>
                  <td className="px-5 py-4"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${items.length ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{items.length ? <AlertTriangle className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}{items.length}</span></td>
                  <td className="px-5 py-4">{latest ? <><p className="font-medium text-slate-800">{latest.type}</p><p className="text-xs text-slate-500">{formatManilaDate(latest.occurredAt)}</p></> : <span className="text-slate-400">No violations</span>}</td>
                  <td className="px-5 py-4 text-right"><button type="button" onClick={() => setSelectedHistory({ student, items })} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-900"><Eye className="h-4 w-4" />View history</button></td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">No students matched your search.</td></tr>}
          </tbody>
        </table>
      </div>

      {selectedHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="violation-history-title" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedHistory(null); }}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div><h2 id="violation-history-title" className="text-xl font-bold text-slate-900">{selectedHistory.student.lastName}, {selectedHistory.student.firstName}</h2><p className="mt-1 text-sm text-slate-500">LRN {selectedHistory.student.lrn} · {selectedHistory.student.gradeName} – {selectedHistory.student.sectionName}</p></div>
              <button type="button" onClick={() => setSelectedHistory(null)} aria-label="Close violation history" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X className="h-5 w-5" /></button>
            </div>
            <div className="max-h-[68vh] overflow-y-auto p-6">
              {selectedHistory.items.length ? (
                <div className="space-y-3">
                  <p className="mb-4 text-sm font-semibold text-slate-700">{selectedHistory.items.length} recorded violation{selectedHistory.items.length === 1 ? "" : "s"}</p>
                  {selectedHistory.items.map((violation, index) => (
                    <article key={violation.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-900">{selectedHistory.items.length - index}</span><h3 className="font-semibold text-slate-900">{violation.type}</h3></div><p className="mt-2 text-sm text-slate-500">{formatManilaDate(violation.occurredAt)}</p></div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">Recorded by {violation.recordedByName || "Unknown user"}</span>
                      </div>
                      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{violation.notes || "No additional notes."}</div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center"><ShieldCheck className="mx-auto h-12 w-12 text-emerald-500" /><p className="mt-4 font-semibold text-slate-900">No violations recorded</p><p className="mt-1 text-sm text-slate-500">This student currently has a clear record.</p></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
