import ExcelJS from "exceljs";

export type ReportRow = { student: string; lrn: string; entry: string; exit: string; remarks: string };

export async function attendanceWorkbook(rows: ReportRow[], section: string, date: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ASTIG";
  const sheet = workbook.addWorksheet("Attendance", { views: [{ state: "frozen", ySplit: 4 }] });
  sheet.columns = [{ width: 44 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 18 }];
  sheet.mergeCells("A1:E1");
  sheet.getCell("A1").value = "ASTIG Attendance Report";
  sheet.getCell("A1").font = { name: "Calibri", size: 18, bold: true, color: { argb: "FF881337" } };
  sheet.getRow(1).height = 30;
  sheet.mergeCells("A2:E2");
  sheet.getCell("A2").value = `${section} — ${date} (Philippine time)`;
  sheet.getRow(2).height = 30;
  sheet.getCell("A2").alignment = { wrapText: true, vertical: "middle" };
  const header = sheet.getRow(4);
  header.values = ["Student", "LRN", "Entry Time", "Exit Time", "Remarks"];
  header.height = 26;
  header.eachCell(cell => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF881337" } };
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  rows.forEach((item) => {
    const row = sheet.addRow([item.student, item.lrn, item.entry, item.exit, item.remarks]);
    row.height = Math.max(30, Math.ceil(item.student.length / 40) * 16);
    row.eachCell(cell => {
      cell.font = { name: "Calibri", size: 11, color: { argb: "FF222222" } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    row.getCell(2).numFmt = "@"; // Preserve all 12 LRN digits in Excel.
    if (item.remarks === "LATE") {
      row.getCell(5).font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFB91C1C" } };
      row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
    }
  });
  sheet.autoFilter = `A4:E${Math.max(4, rows.length + 4)}`;
  sheet.addRow([]);
  const heading = sheet.addRow(["The following students are late:"]);
  sheet.mergeCells(heading.number, 1, heading.number, 5);
  heading.font = { name: "Calibri", size: 12, bold: true };
  heading.height = 26;
  const late = rows.filter(row => row.remarks === "LATE");
  for (const name of late.length ? late.map((row, i) => `${i + 1}. ${row.student}`) : ["No late students."]) {
    const row = sheet.addRow([name]);
    sheet.mergeCells(row.number, 1, row.number, 5);
    row.alignment = { wrapText: true, vertical: "middle" };
    row.height = Math.max(24, Math.ceil(name.length / 90) * 16);
  }
  sheet.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:4" };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
