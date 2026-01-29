import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

interface ReportRow {
  symbol: string;
  proper_title: string | null;
  un_body: string | null;
  date_year: number | null;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json([]);

  // Search SG reports (not resolutions) for merge target selection
  const rows = await query<ReportRow>(
    `SELECT symbol, proper_title, un_body, date_year FROM ${DB_SCHEMA}.sg_reports
     WHERE symbol ILIKE $1 || '%' OR proper_title ILIKE '%' || $1 || '%'
     ORDER BY CASE WHEN symbol ILIKE $1 || '%' THEN 0 ELSE 1 END, date_year DESC NULLS LAST
     LIMIT 20`,
    [q]
  );

  return NextResponse.json(rows.map((r) => ({
    symbol: r.symbol,
    title: r.proper_title?.replace(/\s*:\s*$/, "").trim() || null,
    body: r.un_body,
    year: r.date_year,
  })));
}
