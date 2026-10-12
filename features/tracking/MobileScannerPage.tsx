import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Link2, ShieldAlert } from "lucide-react";
import { useSearchParams } from "react-router";
import { Html5Qrcode } from "html5-qrcode";

import { useAuth } from "../auth/hooks/useAuth";
import { toastService } from "../../app/services/toastService";
import { trackingService } from "./trackingService";

const VIOLATION_TYPES = [
  "Improper uniform",
  "No school ID",
  "Cutting classes",
  "Disruptive behavior",
  "Prohibited item",
  "Other",
];

export function MobileScannerPage() {
  const [params] = useSearchParams();
  const { auth } = useAuth();
  const [session, setSession] = useState(params.get("session") || "");
  const [mode, setMode] = useState<"ATTENDANCE" | "VIOLATION">("ATTENDANCE");
  const [lrn, setLrn] = useState("");
  const [violation, setViolation] = useState(VIOLATION_TYPES[0]);
  const [notes, setNotes] = useState("");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const scanner = useRef<Html5Qrcode | null>(null);

  useEffect(() => () => { if (scanner.current?.isScanning) void scanner.current.stop(); }, []);

  async function startCamera() {
    if (!session.trim()) {
      toastService.error("Enter the kiosk session code first.");
      return;
    }
    setMessage("");
    const instance = scanner.current || new Html5Qrcode("mobile-qr-reader");
    scanner.current = instance;
    try {
      setRunning(true);
      await instance.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          const normalized = decodedText.replace(/\D/g, "");
          if (normalized) {
            setLrn(normalized);
            void instance.stop().finally(() => setRunning(false));
          }
        },
        () => undefined,
      );
    } catch (error) {
      setRunning(false);
      toastService.error(error);
    }
  }

  async function submit() {
    if (!/^\d{12}$/.test(lrn)) {
      toastService.error("Scan or enter a valid 12-digit LRN.");
      return;
    }
    try {
      if (mode === "ATTENDANCE") {
        await trackingService.sendRemoteScan(session.trim().toUpperCase(), lrn, mode);
        setMessage("Attendance scan sent to the kiosk.");
      } else {
        const result = await trackingService.recordViolation(
          lrn,
          violation,
          notes,
          [auth?.firstName, auth?.lastName].filter(Boolean).join(" ") || "ASTIG staff",
        );
        await trackingService.acknowledgeRemoteScan(session.trim().toUpperCase(), {
          kind: "VIOLATION",
          success: true,
          lrn,
          studentName: `${result.student.firstName} ${result.student.lastName}`,
          violation,
        });
        setMessage(`Violation saved for ${result.student.firstName} ${result.student.lastName}.`);
      }
      setLrn("");
      setNotes("");
    } catch (error) {
      toastService.error(error);
    }
  }

  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
    <div className="mx-auto max-w-lg space-y-5">
      <div><p className="text-sm font-semibold text-rose-300">ASTIG Mobile Scanner</p><h1 className="mt-1 text-3xl font-bold">Scan a student QR code</h1><p className="mt-2 text-sm text-slate-300">Pair this phone with the kiosk, then choose attendance or violation.</p></div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <label className="text-sm font-medium text-slate-200">Kiosk session code<input value={session} onChange={(event) => setSession(event.target.value.toUpperCase())} maxLength={8} placeholder="e.g. A7K9Q2" className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-lg font-bold uppercase tracking-[0.25em] text-white outline-none focus:border-rose-400" /></label>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMode("ATTENDANCE")} className={`rounded-xl px-3 py-3 text-sm font-semibold ${mode === "ATTENDANCE" ? "bg-white text-rose-950" : "bg-white/10 text-white"}`}><CheckCircle2 className="mx-auto mb-1 h-5 w-5" />Attendance</button>
          <button type="button" onClick={() => setMode("VIOLATION")} className={`rounded-xl px-3 py-3 text-sm font-semibold ${mode === "VIOLATION" ? "bg-amber-300 text-amber-950" : "bg-white/10 text-white"}`}><ShieldAlert className="mx-auto mb-1 h-5 w-5" />Violation</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-3"><div id="mobile-qr-reader" className="overflow-hidden rounded-xl" />{!running && <button type="button" onClick={() => void startCamera()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-3 font-semibold hover:bg-rose-600"><Camera className="h-5 w-5" />Open rear camera</button>}</div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <label className="text-sm font-medium text-slate-200">Scanned LRN<input inputMode="numeric" value={lrn} onChange={(event) => setLrn(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="12-digit LRN" className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white outline-none focus:border-rose-400" /></label>
        {mode === "VIOLATION" && <div className="mt-4 space-y-4"><label className="block text-sm font-medium text-slate-200">Violation<select value={violation} onChange={(event) => setViolation(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3 text-white">{VIOLATION_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block text-sm font-medium text-slate-200">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Optional details" className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white outline-none" /></label></div>}
        <button type="button" onClick={() => void submit()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-bold text-rose-950 hover:bg-rose-50"><Link2 className="h-5 w-5" />{mode === "ATTENDANCE" ? "Send to kiosk" : "Save violation"}</button>
        {message && <p className="mt-4 rounded-xl bg-emerald-400/15 px-4 py-3 text-sm text-emerald-200">{message}</p>}
      </div>
    </div>
  </main>;
}
