import { getFunctions, httpsCallable } from "firebase/functions";

import { firebaseApp } from "../../lib/firebase";

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

const functions = getFunctions(firebaseApp, "asia-southeast1");
const sendReport = httpsCallable<ReportRequest, ReportResult>(functions, "sendAttendanceReportNow");

export const reportService = {
  async sendAttendanceNow(request: ReportRequest) {
    const response = await sendReport(request);
    return response.data;
  },
};
