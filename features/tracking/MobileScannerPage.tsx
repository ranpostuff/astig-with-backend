import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, ShieldAlert, Square } from "lucide-react";
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

function cameraErrorMessage(error: unknown) {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (/notallowed|permission|denied/i.test(detail)) return "Camera permission was denied. Allow camera access for this site, then try again.";
  if (/notfound|devicesnotfound|no camera/i.test(detail)) return "No usable camera was found on this device.";
  if (/notreadable|trackstart|could not start|in use/i.test(detail)) return "The camera is being used by another app. Close that app and try again.";
  if (/secure|https/i.test(detail)) return "Camera access requires the secure HTTPS site.";
  return `Camera could not start: ${detail}`;
}

export function MobileScannerPage() {
  const [params] = useSearchParams();
  const { auth } = useAuth();
  const [session, setSession] = useState(params.get("session") || "");
  const [mode, setMode] = useState<"ATTENDANCE" | "VIOLATION">("ATTENDANCE");
  const [violation, setViolation] = useState(VIOLATION_TYPES[0]);
  const [notes, setNotes] = useState("");
  const [running, setRunning] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("Tap Start QR scanner to allow camera access.");
  const scanner = useRef<Html5Qrcode | null>(null);
  const scanLocked = useRef(false);

  useEffect(() => () => {
    if (scanner.current?.isScanning) void scanner.current.stop();
  }, []);

  async function resolveSession() {
    if (session.trim()) return session.trim().toUpperCase();
    const activeSession = await trackingService.findLatestActiveScanSession();
    if (activeSession) setSession(activeSession);
    return activeSession;
  }

  async function submitScannedLrn(lrn: string, sessionCode: string | null) {
    if (mode === "ATTENDANCE") {
      if (sessionCode) {
        await trackingService.sendRemoteScan(sessionCode, lrn, mode);
        setMessage(`LRN ${lrn} sent to the kiosk automatically.`);
      } else {
        const result = await trackingService.recordAttendance(lrn, "MOBILE");
        setMessage(`${result.student.firstName} ${result.student.lastName}: ${result.action === "ENTRY" ? "entry" : "exit"} saved.`);
      }
      return;
    }

    const result = await trackingService.recordViolation(
      lrn,
      violation,
      notes,
      [auth?.firstName, auth?.lastName].filter(Boolean).join(" ") || "ASTIG staff",
    );
    if (sessionCode) {
      await trackingService.acknowledgeRemoteScan(sessionCode, {
        kind: "VIOLATION",
        success: true,
        lrn,
        studentName: `${result.student.firstName} ${result.student.lastName}`,
        violation,
      });
    }
    setMessage(`${violation} saved for ${result.student.firstName} ${result.student.lastName}.`);
    setNotes("");
  }

  async function handleDecoded(decodedText: string) {
    if (scanLocked.current) return;
    const lrn = decodedText.replace(/\D/g, "");
    if (!/^\d{12}$/.test(lrn)) {
      setMessage("That QR code is not a valid 12-digit student LRN.");
      return;
    }

    scanLocked.current = true;
    setSending(true);
    try {
      scanner.current?.pause(true);
      const sessionCode = await resolveSession();
      await submitScannedLrn(lrn, sessionCode);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The scan could not be saved.";
      setMessage(detail);
      toastService.error(error);
    } finally {
      setSending(false);
      window.setTimeout(() => {
        try {
          if (scanner.current?.isScanning) scanner.current.resume();
        } catch {
          // The scanner was stopped while the result was being processed.
        }
        scanLocked.current = false;
      }, 1400);
    }
  }

  async function startCamera() {
    setMessage("Requesting camera permission...");
    try {
      await resolveSession();
      const instance = scanner.current || new Html5Qrcode("mobile-qr-reader");
      scanner.current = instance;
      setRunning(true);
      await instance.start(
        { facingMode: "environment" },
        { fps: 12, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
        (decodedText) => void handleDecoded(decodedText),
        () => undefined,
      );
      setMessage("Camera is ready. Point it at a student QR code.");
    } catch (error) {
      setRunning(false);
      const detail = cameraErrorMessage(error);
      setMessage(detail);
      toastService.error(new Error(detail));
    }
  }

  async function stopCamera() {
    if (scanner.current?.isScanning) await scanner.current.stop();
    setRunning(false);
    setMessage("Scanner stopped.");
  }

  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
    <div className="mx-auto max-w-lg space-y-5">
      <div><p className="text-sm font-semibold text-rose-300">ASTIG Scanner</p><h1 className="mt-1 text-3xl font-bold">Scan a student QR code</h1><p className="mt-2 text-sm text-slate-300">One tap opens the camera. A valid QR code is submitted automatically.</p></div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
        <button type="button" disabled={running} onClick={() => setMode("ATTENDANCE")} className={`rounded-xl px-3 py-3 text-sm font-semibold disabled:cursor-not-allowed ${mode === "ATTENDANCE" ? "bg-white text-rose-950" : "bg-white/10 text-white"}`}><CheckCircle2 className="mx-auto mb-1 h-5 w-5" />Attendance</button>
        <button type="button" disabled={running} onClick={() => setMode("VIOLATION")} className={`rounded-xl px-3 py-3 text-sm font-semibold disabled:cursor-not-allowed ${mode === "VIOLATION" ? "bg-amber-300 text-amber-950" : "bg-white/10 text-white"}`}><ShieldAlert className="mx-auto mb-1 h-5 w-5" />Violation</button>
      </div>

      {mode === "VIOLATION" && !running && <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5"><label className="block text-sm font-medium text-slate-200">Violation<select value={violation} onChange={(event) => setViolation(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3 text-white">{VIOLATION_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block text-sm font-medium text-slate-200">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Optional details" className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white outline-none" /></label></div>}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-3">
        <div id="mobile-qr-reader" className="overflow-hidden rounded-xl" />
        {!running ? <button type="button" onClick={() => void startCamera()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-4 text-lg font-bold hover:bg-rose-600"><Camera className="h-6 w-6" />Start QR scanner</button> : <button type="button" onClick={() => void stopCamera()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 font-semibold hover:bg-white/15"><Square className="h-5 w-5" />Stop scanner</button>}
      </div>

      <div className={`rounded-xl px-4 py-3 text-sm ${sending ? "bg-amber-300/15 text-amber-200" : "bg-emerald-400/15 text-emerald-200"}`}>{sending && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}{message}</div>
      {session && <p className="text-center text-xs text-slate-400">Connected to kiosk automatically.</p>}
    </div>
  </main>;
}
