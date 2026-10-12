import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Search } from "lucide-react";

import { trackingService } from "./trackingService";
import type { DailyAttendanceRecord, FirebaseStudentRecord } from "./types";

function formatTime(value?: number | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

export function AttendancePage() {
  const [date, setDate] = useState(trackingService.schoolDateKey());
  const [students, setStudents] = useState<FirebaseStudentRecord[]>([]);
  const [records, setRecords] = useState<Record<string, DailyAttendanceRecord>>({});
  const [section, setSection] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void trackingService.listStudents().then(setStudents).finally(() => setLoading(false));
  }, []);

  useEffect(() => trackingService.subscribeAttendance(date, setRecords), [date]);

  const sections = useMemo(
    () => Array.from(new Set(students.map((student) => student.sectionName))).sort(),
    [students],
  );
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students.filter((student) => {
      const name = `${student.lastName}, ${student.firstName} ${student.middleName || ""}`.toLowerCase();
      return (!section || student.sectionName === section) && (!term || name.includes(term) || student.lrn.includes(term));
    });
  }, [students, section, search]);
  const present = rows.filter((student) => records[student.lrn]).length;
  const late = rows.filter((student) => records[student.lrn]?.late).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Section attendance</h1>
        <p className="mt-1 text-sm text-slate-500">Entry after 7:15 a.m. is automatically marked late.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Students", rows.length, "text-slate-900"],
          ["Present", present, "text-emerald-700"],
          ["Late", late, "text-red-700"],
        ].map(([label, value, color]) => (
          <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{label}</p><p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">Date
          <div className="relative mt-2"><CalendarDays className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3" /></div>
        </label>
        <label className="text-sm font-medium text-slate-700">Section
          <select value={section} onChange={(event) => setSection(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">All sections</option>{sections.map((item) => <option key={item}>{item}</option>)}</select>
        </label>
        <label className="text-sm font-medium text-slate-700">Search
          <div className="relative mt-2"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or LRN" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3" /></div>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Section</th><th className="px-5 py-3">Entry</th><th className="px-5 py-3">Exit</th><th className="px-5 py-3">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">Loading attendance...</td></tr> : rows.map((student) => {
              const record = records[student.lrn];
              return <tr key={student.lrn} className={record?.late ? "bg-red-50" : "hover:bg-slate-50"}>
                <td className="px-5 py-4"><p className={`font-semibold ${record?.late ? "text-red-800" : "text-slate-900"}`}>{student.lastName}, {student.firstName} {student.middleName || ""}</p><p className="text-xs text-slate-500">{student.lrn}</p></td>
                <td className="px-5 py-4 text-slate-600">{student.gradeName} · {student.sectionName}</td>
                <td className="px-5 py-4 text-slate-700">{formatTime(record?.entryAt)}</td>
                <td className="px-5 py-4 text-slate-700">{formatTime(record?.exitAt)}</td>
                <td className="px-5 py-4">{!record ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">ABSENT</span> : record.late ? <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">LATE</span> : <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">ON TIME</span>}</td>
              </tr>;
            })}
          </tbody>
        </table>
        {!loading && !rows.length && <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Clock3 className="h-4 w-4" />No students match the filters.</div>}
      </div>
    </div>
  );
}
