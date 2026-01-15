import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

interface ReportRow {
  proper_title: string;
  symbols: string[];
  years: (number | null)[];
  count: number;
  latest_year: number | null;
}

interface SingleReportRow {
  id: number;
  symbol: string;
  proper_title: string | null;
  title: string | null;
  date_year: number | null;
  publication_date: string | null;
  subject_terms: string[] | null;
  resource_type_level3: string[] | null;
  text: string | null;
  raw_json: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export async function GET(req: NextRequest) {
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");
  const offset = (page - 1) * limit;
  const symbol = req.nextUrl.searchParams.get("symbol");

  // If a specific symbol is requested, return that single report
  if (symbol) {
    const reports = await query<SingleReportRow>(
      `SELECT id, symbol, proper_title, title, date_year, publication_date,
              subject_terms, resource_type_level3, text, raw_json,
              created_at, updated_at
       FROM ${DB_SCHEMA}.reports
       WHERE symbol = $1`,
      [symbol]
    );

    if (reports.length === 0) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    return NextResponse.json(reports[0]);
  }

  // Otherwise, return paginated list grouped by title
  const [reports, countResult] = await Promise.all([
    query<ReportRow>(
      `SELECT 
        proper_title,
        array_agg(symbol ORDER BY date_year DESC NULLS LAST, symbol) as symbols,
        array_agg(date_year ORDER BY date_year DESC NULLS LAST, symbol) as years,
        COUNT(*)::int as count,
        MAX(date_year) as latest_year
      FROM ${DB_SCHEMA}.reports
      WHERE proper_title IS NOT NULL
      GROUP BY proper_title
      ORDER BY latest_year DESC NULLS LAST, proper_title
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query<{ total: number }>(
      `SELECT COUNT(DISTINCT proper_title)::int as total
       FROM ${DB_SCHEMA}.reports
       WHERE proper_title IS NOT NULL`
    ),
  ]);

  return NextResponse.json({
    reports: reports.map((r) => ({
      title: r.proper_title?.replace(/\s*:\s*$/, "").trim(),
      versions: r.symbols.map((s, i) => ({ symbol: s, year: r.years[i] })),
      count: r.count,
      latestYear: r.latest_year,
    })),
    total: countResult[0]?.total || 0,
    page,
    limit,
  });
}
