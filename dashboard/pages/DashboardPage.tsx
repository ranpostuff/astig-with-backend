import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Users } from "lucide-react";
import { Link } from "react-router";
import { trackingService } from "../../tracking/trackingService";
import type { DailyAttendanceRecord, FirebaseStudentRecord, ViolationRecord } from "../../tracking/types";

export default function DashboardPage() {
  const [students, setStudents] = useState<FirebaseStudentRecord[]>([]);
  const [attendance, setAttendance] = useState<Record<string, DailyAttendanceRecord>>({});
  const [violations, setViolations] = useState<ViolationRecord[]>([]);
  useEffect(() => { void trackingService.listStudents().then(setStudents); }, []);
  useEffect(() => trackingService.subscribeAttendance(trackingService.schoolDateKey(), setAttendance), []);
  useEffect(() => trackingService.subscribeViolations(setViolations), []);
  const late = useMemo(() => Object.values(attendance).filter((item) => item.late).length, [attendance]);
  const todayStart = new Date(`${trackingService.schoolDateKey()}T00:00:00+08:00`).getTime();
  const todayViolations = violations.filter((item) => item.occurredAt >= todayStart).length;
  const cards = [
    { label: "Students", value: students.length, icon: Users, color: "text-slate-900", bg: "bg-slate-100" },
    { label: "Present today", value: Object.keys(attendance).length, icon: CheckCircle2, color: "text-emerald-800", bg: "bg-emerald-100" },
    { label: "Late today", value: late, icon: Clock3, color: "text-red-800", bg: "bg-red-100" },
    { label: "Violations today", value: todayViolations, icon: AlertTriangle, color: "text-amber-900", bg: "bg-amber-100" },
  ];
  return <main className="space-y-7">
    <div><h1 className="text-3xl font-bold text-rose-950">ASTIG Dashboard</h1><p className="mt-2 text-slate-600">Live student attendance and discipline overview.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon, color, bg }) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className={`inline-flex rounded-xl p-3 ${bg} ${color}`}><Icon className="h-5 w-5" /></div><p className="mt-4 text-sm text-slate-500">{label}</p><p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p></div>)}</div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Link to="/attendance" className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-rose-300 hover:shadow-md"><h2 className="font-bold text-slate-900">View section attendance</h2><p className="mt-2 text-sm text-slate-500">Check entry, exit, absence, and late status.</p></Link><Link to="/verification" className="rounded-2xl bg-rose-950 p-6 text-white hover:bg-rose-900"><h2 className="font-bold">Open verification kiosk</h2><p className="mt-2 text-sm text-rose-100">Show scan results live on this screen.</p></Link><Link to="/scanner" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 hover:border-rose-400 hover:shadow-md"><h2 className="font-bold text-rose-950">Open QR scanner</h2><p className="mt-2 text-sm text-rose-800">One tap opens the camera and submits scans automatically.</p></Link><Link to="/violations" className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-amber-300 hover:shadow-md"><h2 className="font-bold text-slate-900">Review student records</h2><p className="mt-2 text-sm text-slate-500">See violations and the latest recorded incident.</p></Link></div>
  </main>;
}
