import { firebaseAuth } from "../../lib/firebase";

type ReportRequest = {
  dateKey: string;
  gradeName?: string;
  sectionId?: number;
};

type ReportResult = {
  sent: number;
  skipped: string[];
  emailIds: string[];
};

export const reportService = {
  async sendAttendanceNow(request: ReportRequest) {
    const token = await firebaseAuth.currentUser?.getIdToken();
    if (!token) throw new Error("Sign in before sending an attendance report.");
    const response = await fetch("/api/attendance-report", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });
    const responseText = await response.text();
    let result: ReportResult & { error?: string };
    try {
      result = responseText
        ? JSON.parse(responseText) as ReportResult & { error?: string }
        : { sent: 0, skipped: [], emailIds: [], error: `Email service returned HTTP ${response.status}.` };
    } catch {
      result = {
        sent: 0,
        skipped: [],
        emailIds: [],
        error: `Email service returned HTTP ${response.status}. Redeploy the Vercel API route.`,
      };
    }
    if (!response.ok) throw new Error(result.error || "Unable to send attendance report.");
    return result;
  },
};
