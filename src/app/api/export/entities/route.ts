import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";

interface ExportRow {
  Entity: string;
  Status: string;
  "Users Signed In": number;
  "Users Active": number;
  "Reports Suggested": number;
  "Suggested (DGACM)": number;
  "Suggested (DRI)": number;
  "Suggested (AI)": number;
  "Reports Confirmed": number;
  "Reports with Response": number;
}

export async function POST(req: NextRequest) {
  const rows: ExportRow[] = await req.json();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "UN EOSG";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Entity Progress");

  // Define columns
  sheet.columns = [
    { header: "Entity", key: "Entity", width: 50 },
    { header: "Status", key: "Status", width: 16 },
    { header: "Users Signed In", key: "Users Signed In", width: 18 },
    { header: "Users Active", key: "Users Active", width: 16 },
    { header: "Reports Suggested", key: "Reports Suggested", width: 20 },
    { header: "Suggested (DGACM)", key: "Suggested (DGACM)", width: 20 },
    { header: "Suggested (DRI)", key: "Suggested (DRI)", width: 18 },
    { header: "Suggested (AI)", key: "Suggested (AI)", width: 16 },
    { header: "Reports Confirmed", key: "Reports Confirmed", width: 20 },
    {
      header: "Reports with Response",
      key: "Reports with Response",
      width: 22,
    },
  ];

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF009EDB" }, // UN blue
  };
  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 20;

  // Add data rows
  rows.forEach((row) => {
    const added = sheet.addRow(row);
    added.alignment = { vertical: "middle" };
  });

  // Auto-filter on header row
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };

  // Freeze header row
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="entity-progress.xlsx"',
    },
  });
}
