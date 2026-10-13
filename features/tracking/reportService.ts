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
    const result = await response.json() as ReportResult & { error?: string };
    if (!response.ok) throw new Error(result.error || "Unable to send attendance report.");
    return result;
  },
};
