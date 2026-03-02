import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

// UN blue
const UN_BLUE = "FF009edb";
const UN_BLUE_LIGHT = "FFE6F4FA";

function applyHeaderStyle(row: ExcelJS.Row, colCount: number) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: UN_BLUE },
  };
  row.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
  row.height = 22;
  // Border on header cells
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFB0CEDD" } },
    };
  }
}

function applyDataRow(row: ExcelJS.Row, colCount: number, even: boolean) {
  if (even) {
    row.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: UN_BLUE_LIGHT },
    };
  }
  row.alignment = { vertical: "top", wrapText: false };
  row.height = 18;
  for (let c = 1; c <= colCount; c++) {
    row.getCell(c).border = {
      bottom: { style: "hair", color: { argb: "FFE5E7EB" } },
    };
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // ── Fetch all data in parallel ──────────────────────────────────────────────

  const [responsesRows, entityConfirmRows] =
    await Promise.all([
      // Sheet 1: Survey Responses
      query<{
        id: string;
        proper_title: string;
        latest_symbol: string;
        user_entity: string;
        normalized_body: string;
        user_email: string;
        status: string;
        frequency: string | null;
        format: string | null;
        format_other: string | null;
        merge_targets: string[] | null;
        discontinue_reason: string | null;
        comments: string | null;
        calculated_frequency: string | null;
        confirmed_frequency: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT
          sr.id,
          sr.proper_title,
          sr.latest_symbol,
          sr.user_entity,
          sr.normalized_body,
          u.email AS user_email,
          sr.status,
          sr.frequency,
          sr.format,
          sr.format_other,
          sr.merge_targets,
          sr.discontinue_reason,
          sr.comments,
          rf.calculated_frequency,
          rfc.frequency AS confirmed_frequency,
          sr.created_at,
          sr.updated_at
        FROM ${DB_SCHEMA}.survey_responses sr
        JOIN ${DB_SCHEMA}.users u ON u.id = sr.responded_by_user_id
        LEFT JOIN ${DB_SCHEMA}.report_frequencies rf
          ON rf.proper_title = sr.proper_title AND rf.normalized_body = sr.normalized_body
        LEFT JOIN ${DB_SCHEMA}.report_frequency_confirmations rfc
          ON rfc.proper_title = sr.proper_title AND rfc.normalized_body = sr.normalized_body
        ORDER BY sr.user_entity, sr.proper_title`,
      ),

      // Sheet 2: Entity Confirmations (all reports)
      query<{
        id: string;
        proper_title: string;
        latest_symbol: string | null;
        entity: string;
        role: string;
        user_email: string;
        confirmed_at: string;
        notes: string | null;
      }>(
        `SELECT
          rec.id,
          rec.proper_title,
          sym.latest_symbol,
          rec.entity,
          rec.role,
          u.email AS user_email,
          rec.confirmed_at,
          rec.notes
        FROM ${DB_SCHEMA}.report_entity_confirmations rec
        JOIN ${DB_SCHEMA}.users u ON u.id = rec.confirmed_by_user_id
        LEFT JOIN LATERAL (
          SELECT latest_symbol FROM ${DB_SCHEMA}.survey_responses
          WHERE proper_title = rec.proper_title LIMIT 1
        ) sym ON true
        ORDER BY rec.entity, rec.proper_title`,
      ),
    ]);

  // ── Build workbook ─────────────────────────────────────────────────────────

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "UN EOSG";
  workbook.created = new Date();
  workbook.properties.date1904 = false;

  // ── Sheet 1: Survey Responses ──────────────────────────────────────────────

  const sheetResponses = workbook.addWorksheet("Survey Responses", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheetResponses.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Report Title", key: "proper_title", width: 55 },
    { header: "Latest Symbol", key: "latest_symbol", width: 20 },
    { header: "UN Body", key: "normalized_body", width: 22 },
    { header: "Response From (Email)", key: "user_email", width: 34 },
    { header: "User Entity", key: "user_entity", width: 20 },
    { header: "Status", key: "status", width: 16 },
    { header: "Recommended Frequency", key: "frequency", width: 24 },
    { header: "Recommended Format", key: "format", width: 20 },
    { header: "Format (Other)", key: "format_other", width: 22 },
    { header: "Merge Targets", key: "merge_targets", width: 30 },
    { header: "Discontinue Reason", key: "discontinue_reason", width: 30 },
    { header: "Comments", key: "comments", width: 40 },
    {
      header: "Pre-Calculated Frequency",
      key: "calculated_frequency",
      width: 24,
    },
    {
      header: "Submitted Frequency",
      key: "confirmed_frequency",
      width: 26,
    },
    { header: "Last Updated At", key: "updated_at", width: 22 },
  ];

  applyHeaderStyle(sheetResponses.getRow(1), sheetResponses.columns.length);

  responsesRows.forEach((r, i) => {
    const row = sheetResponses.addRow({
      id: parseInt(r.id),
      proper_title: r.proper_title,
      latest_symbol: r.latest_symbol,
      normalized_body: r.normalized_body || "",
      user_entity: r.user_entity,
      user_email: r.user_email,
      status: r.status,
      frequency: r.frequency ?? "",
      format: r.format ?? "",
      format_other: r.format_other ?? "",
      merge_targets: r.merge_targets?.join("; ") ?? "",
      discontinue_reason: r.discontinue_reason ?? "",
      comments: r.comments ?? "",
      calculated_frequency: r.calculated_frequency ?? "",
      confirmed_frequency: r.confirmed_frequency ?? "",
      created_at: r.created_at
        ? new Date(r.created_at).toISOString().slice(0, 19).replace("T", " ")
        : "",
      updated_at: r.updated_at
        ? new Date(r.updated_at).toISOString().slice(0, 19).replace("T", " ")
        : "",
    });
    applyDataRow(row, sheetResponses.columns.length, i % 2 === 1);
  });

  sheetResponses.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheetResponses.columns.length },
  };

  // ── Sheet 2: Entity Confirmations ──────────────────────────────────────────

  const sheetConfirm = workbook.addWorksheet("Entity Confirmations", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheetConfirm.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Report Title", key: "proper_title", width: 55 },
    { header: "Latest Symbol", key: "latest_symbol", width: 20 },
    { header: "Entity", key: "entity", width: 40 },
    { header: "Role", key: "role", width: 16 },
    { header: "Confirmed By (Email)", key: "user_email", width: 34 },
    { header: "Confirmed At", key: "confirmed_at", width: 22 },
    { header: "Notes", key: "notes", width: 40 },
  ];

  applyHeaderStyle(sheetConfirm.getRow(1), sheetConfirm.columns.length);

  entityConfirmRows.forEach((r, i) => {
    const row = sheetConfirm.addRow({
      id: parseInt(r.id),
      proper_title: r.proper_title,
      latest_symbol: r.latest_symbol ?? "",
      entity: r.entity,
      role: r.role,
      user_email: r.user_email,
      confirmed_at: r.confirmed_at
        ? new Date(r.confirmed_at).toISOString().slice(0, 19).replace("T", " ")
        : "",
      notes: r.notes ?? "",
    });
    applyDataRow(row, sheetConfirm.columns.length, i % 2 === 1);
  });

  sheetConfirm.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheetConfirm.columns.length },
  };

  // ── Serialize & return ─────────────────────────────────────────────────────

  const buffer = await workbook.xlsx.writeBuffer();
  const ts = new Date()
    .toISOString()
    .slice(0, 19)
    .replace("T", "_")
    .replace(/:/g, "-");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="survey-export_${ts}.xlsx"`,
    },
  });
}
