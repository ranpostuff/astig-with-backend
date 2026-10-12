import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { trackingService } from "./trackingService";
import type { FirebaseStudentRecord, ViolationRecord } from "./types";

export function ViolationsPage() {
  const [students, setStudents] = useState<FirebaseStudentRecord[]>([]);
  const [violations, setViolations] = useState<ViolationRecord[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => { void trackingService.listStudents().then(setStudents); }, []);
  useEffect(() => trackingService.subscribeViolations(setViolations), []);

  const rows = useMemo(() => {
    const byLrn = new Map<string, ViolationRecord[]>();
    for (const violation of violations) byLrn.set(violation.lrn, [...(byLrn.get(violation.lrn) || []), violation]);
    const term = search.toLowerCase().trim();
    return students
      .map((student) => ({ student, items: byLrn.get(student.lrn) || [] }))
      .filter(({ student }) => !term || `${student.lastName} ${student.firstName} ${student.lrn}`.toLowerCase().includes(term))
      .sort((a, b) => b.items.length - a.items.length || a.student.lastName.localeCompare(b.student.lastName));
  }, [students, violations, search]);

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold text-slate-900">Student records</h1><p className="mt-1 text-sm text-slate-500">Review each student’s violation history alongside attendance and late records.</p></div>
    <div className="relative max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student or LRN" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3" /></div>
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Section</th><th className="px-5 py-3">Violations</th><th className="px-5 py-3">Latest record</th><th className="px-5 py-3">Recorded by</th></tr></thead><tbody className="divide-y divide-slate-100">
      {rows.map(({ student, items }) => { const latest = items[0]; return <tr key={student.lrn} className={items.length ? "bg-amber-50/60" : "hover:bg-slate-50"}><td className="px-5 py-4"><p className="font-semibold text-slate-900">{student.lastName}, {student.firstName}</p><p className="text-xs text-slate-500">{student.lrn}</p></td><td className="px-5 py-4 text-slate-600">{student.sectionName}</td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${items.length ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{items.length ? <AlertTriangle className="h-3 w-3" /> : null}{items.length}</span></td><td className="px-5 py-4">{latest ? <><p className="font-medium text-slate-800">{latest.type}</p><p className="text-xs text-slate-500">{new Date(latest.occurredAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</p>{latest.notes && <p className="mt-1 max-w-xs text-xs text-slate-600">{latest.notes}</p>}</> : <span className="text-slate-400">No violations</span>}</td><td className="px-5 py-4 text-slate-600">{latest?.recordedByName || "—"}</td></tr>; })}
    </tbody></table></div>
  </div>;
}
