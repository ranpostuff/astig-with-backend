import { CheckCircle2, Clock3, Keyboard, QrCode, ShieldAlert, Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { SchoolLogoBackground } from "../components/SchoolLogoBackground";
import { VerificationResult } from "../components/VerificationResult";
import { trackingService } from "../../tracking/trackingService";
import type { ScanResult } from "../../tracking/types";
import type { VerificationResponse } from "../types/verification";

function createSessionCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (value) => alphabet[value % alphabet.length]).join("");
}

function toVerification(result: ScanResult): VerificationResponse {
  return {
    id: result.student.id,
    verifiedAt: new Date(result.attendance.lastScanAt).toISOString(),
    isEntry: result.action === "ENTRY",
    firstName: result.student.firstName,
    middleName: result.student.middleName,
    lastName: result.student.lastName,
    studentProfilePic: result.student.studentPicUrl,
    extension: result.student.extension,
    gradeName: result.student.gradeName,
    sectionName: result.student.sectionName,
    createdDate: new Date(result.student.createdAt).toISOString(),
    createdBy: null,
  };
}

export function StudentVerificationPage() {
  const navigate = useNavigate();
  const [sessionCode] = useState(createSessionCode);
  const [student, setStudent] = useState<VerificationResponse | null>(null);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "verifying" | "success" | "error" | "violation">("idle");
  const [currentTime, setCurrentTime] = useState(new Date());
  const handledRemoteId = useRef("");
  const scannerBuffer = useRef("");
  const scannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetSoon = useCallback(() => {
    if (resultTimer.current) clearTimeout(resultTimer.current);
    resultTimer.current = setTimeout(() => {
      setStudent(null);
      setMessage("");
      setState("idle");
    }, 6000);
  }, []);

  const processAttendance = useCallback(async (lrn: string, source: "KIOSK" | "MOBILE") => {
    setState("verifying");
    setStudent(null);
    setMessage("");
    try {
      const result = await trackingService.recordAttendance(lrn, source);
      setStudent(toVerification(result));
      setMessage(result.attendance.late && result.action === "ENTRY" ? "Verified · Marked late" : "Verified");
      setState("success");
      resetSoon();
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to verify the student.");
      setState("error");
      resetSoon();
      throw error;
    }
  }, [resetSoon]);

  useEffect(() => {
    void trackingService.createScanSession(sessionCode);
    const unsubscribe = trackingService.subscribeScanSession(sessionCode, (session) => {
      const pending = session?.pendingScan as { id?: string; lrn?: string; mode?: string } | undefined;
      if (pending?.id && pending.lrn && pending.id !== handledRemoteId.current) {
        handledRemoteId.current = pending.id;
        if (pending.mode === "ATTENDANCE") {
          void processAttendance(pending.lrn, "MOBILE")
            .then((result) => trackingService.acknowledgeRemoteScan(sessionCode, {
              kind: "ATTENDANCE",
              success: true,
              lrn: pending.lrn,
              studentName: `${result.student.firstName} ${result.student.lastName}`,
              action: result.action,
            }))
            .catch(() => trackingService.acknowledgeRemoteScan(sessionCode, {
              kind: "ATTENDANCE",
              success: false,
              lrn: pending.lrn,
            }));
        }
      }
      const remoteResult = session?.lastResult as {
        kind?: string;
        acknowledgedAt?: number;
        success?: boolean;
        studentName?: string;
        violation?: string;
      } | undefined;
      if (remoteResult?.kind === "VIOLATION" && remoteResult.acknowledgedAt && remoteResult.acknowledgedAt > Date.now() - 8000) {
        setStudent(null);
        setState(remoteResult.success ? "violation" : "error");
        setMessage(remoteResult.success ? `${remoteResult.violation} recorded for ${remoteResult.studentName}.` : "The violation could not be saved.");
        resetSoon();
      }
    });
    return () => {
      unsubscribe();
      void trackingService.closeScanSession(sessionCode);
    };
  }, [processAttendance, resetSoon, sessionCode]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        navigate("/");
        return;
      }
      if (event.ctrlKey || event.altKey || event.metaKey || state === "verifying") return;
      if (event.key === "Enter") {
        const lrn = scannerBuffer.current.trim();
        scannerBuffer.current = "";
        if (lrn) void processAttendance(lrn, "KIOSK");
        return;
      }
      if (event.key.length !== 1) return;
      scannerBuffer.current += event.key;
      if (scannerTimer.current) clearTimeout(scannerTimer.current);
      scannerTimer.current = setTimeout(() => { scannerBuffer.current = ""; }, 150);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, processAttendance, state]);

  const time = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }).format(currentTime);
  const date = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(currentTime);
  const scannerUrl = new URL(
    `scanner?session=${sessionCode}`,
    `${window.location.origin}${import.meta.env.BASE_URL}`,
  ).toString();

  return <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-rose-950 via-rose-900 to-pink-900">
    <SchoolLogoBackground />
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/10 px-5 py-4 backdrop-blur-md sm:px-8">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white font-black text-rose-950">A</div><div><p className="font-bold text-white">ASTIG</p><p className="text-xs text-rose-200">Student Tracking Kiosk</p></div></div>
        <div className="flex items-center gap-3 text-white"><Clock3 className="h-4 w-4 text-rose-200" /><div className="text-right"><p className="text-sm font-semibold">{time}</p><p className="text-xs text-rose-200">{date}</p></div></div>
      </header>

      <section className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
        {state === "success" && student ? <VerificationResult student={student} /> : state === "violation" ? (
          <div className="w-full max-w-2xl rounded-[2rem] border border-amber-200 bg-white/95 px-8 py-12 text-center shadow-2xl"><ShieldAlert className="mx-auto h-16 w-16 text-amber-600" /><h1 className="mt-5 text-3xl font-bold text-slate-900">Violation recorded</h1><p className="mt-3 text-slate-600">{message}</p></div>
        ) : state === "error" ? (
          <div className="w-full max-w-2xl rounded-[2rem] border border-red-200 bg-white/95 px-8 py-12 text-center shadow-2xl"><X className="mx-auto h-16 w-16 text-red-600" /><h1 className="mt-5 text-3xl font-bold text-slate-900">Scan failed</h1><p className="mt-3 text-slate-600">{message}</p></div>
        ) : state === "verifying" ? (
          <div className="text-center text-white"><div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-white/30 border-t-white" /><h1 className="mt-6 text-3xl font-bold">Verifying student…</h1></div>
        ) : (
          <div className="w-full max-w-4xl text-center text-white">
            <CheckCircle2 className="mx-auto h-20 w-20 text-rose-100" /><h1 className="mt-5 text-4xl font-bold">Ready to scan</h1><p className="mt-3 text-rose-100">Use the kiosk scanner or pair a phone camera.</p>
            <div className="mx-auto mt-8 grid max-w-3xl gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-6 backdrop-blur"><Keyboard className="mx-auto h-8 w-8" /><h2 className="mt-3 font-bold">USB scanner</h2><p className="mt-2 text-sm text-rose-100">Scan a student ID barcode or QR code directly.</p></div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-6 backdrop-blur"><Smartphone className="mx-auto h-8 w-8" /><h2 className="mt-3 font-bold">Phone camera</h2><p className="mt-2 text-sm text-rose-100">Open the scanner, allow the camera, and scan. No Send button is needed.</p><a href={scannerUrl} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-bold text-rose-950 hover:bg-rose-50"><QrCode className="h-5 w-5" />Open QR scanner</a></div>
            </div>
          </div>
        )}
      </section>
      <footer className="flex items-center justify-center gap-2 border-t border-white/10 bg-black/10 px-4 py-3 text-xs text-rose-100"><QrCode className="h-4 w-4" />Mobile scans update this kiosk in real time.</footer>
    </div>
  </main>;
}
