import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

interface MonthlyRow {
  month: string;
  lang: string;
  downloads: number;
}

export async function GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.getAll("symbol");

  if (symbols.length === 0) {
    return NextResponse.json(
      { error: "At least one symbol parameter is required" },
      { status: 400 }
    );
  }

  try {
    // Sum across (recid, date, lang) per symbol, then aggregate monthly per lang.
    // We use DISTINCT on (recid, date, lang) so compound records don't double-count
    // when multiple symbols in the report group share the same DL record.
    const rows = await query<MonthlyRow>(
      `WITH src AS (
         SELECT DISTINCT recid, date, lang, downloads
         FROM ${DB_SCHEMA}.report_download_stats
         WHERE symbol = ANY($1::text[])
       )
       SELECT
         to_char(date_trunc('month', date), 'YYYY-MM') AS month,
         lang,
         SUM(downloads)::int AS downloads
       FROM src
       GROUP BY 1, 2
       ORDER BY 1, 2`,
      [symbols as unknown as string]
    );

    const months = Array.from(new Set(rows.map((r) => r.month))).sort();
    const totals = new Map<string, number>();
    const byMonth = new Map<string, Map<string, number>>();
    rows.forEach((r) => {
      totals.set(r.lang, (totals.get(r.lang) || 0) + r.downloads);
      if (!byMonth.has(r.month)) byMonth.set(r.month, new Map());
      byMonth.get(r.month)!.set(r.lang, r.downloads);
    });

    const languages = Array.from(totals.keys()).sort(
      (a, b) => (totals.get(b) || 0) - (totals.get(a) || 0)
    );

    const series = months.map((month) => {
      const langs: Record<string, number> = {};
      let total = 0;
      languages.forEach((lang) => {
        const v = byMonth.get(month)?.get(lang) || 0;
        langs[lang] = v;
        total += v;
      });
      return { month, langs, total };
    });

    const totalsObj: Record<string, number> = {};
    languages.forEach((l) => (totalsObj[l] = totals.get(l) || 0));
    const total = Array.from(totals.values()).reduce((a, b) => a + b, 0);

    return NextResponse.json({
      languages,
      totals: totalsObj,
      total,
      series,
    });
  } catch (error) {
    console.error("Error loading download stats for symbols:", symbols, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to load download stats", details: errorMessage },
      { status: 500 }
    );
  }
}
