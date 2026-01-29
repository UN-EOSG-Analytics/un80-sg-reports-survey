import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

interface ReportRow {
  proper_title: string;
  symbol: string;
  un_body: string | null;
  date_year: number | null;
}

// Parse PostgreSQL array string like {"General Assembly","Human Rights Bodies"} to extract first element
function parseBodyString(bodyStr: string | null): string | null {
  if (!bodyStr) return null;
  if (bodyStr.startsWith('{') && bodyStr.endsWith('}')) {
    const inner = bodyStr.slice(1, -1);
    const match = inner.match(/^"([^"]+)"|^([^,]+)/);
    if (match) return match[1] || match[2] || null;
  }
  return bodyStr;
}

/**
 * Search SG reports (not resolutions) by symbol or title.
 * Used for the inline search when adding reports to an entity's reports list.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  try {
    // Search sg_reports view - handles all filtering:
    // - Type filtering, proper_title required, CORR/REV excluded, credentials excluded
    // Group by proper_title to get unique report series
    // Return the latest version's metadata
    const rows = await query<ReportRow>(
      `WITH ranked AS (
        SELECT 
          proper_title,
          symbol,
          un_body,
          date_year,
          ROW_NUMBER() OVER (
            PARTITION BY proper_title 
            ORDER BY date_year DESC NULLS LAST, publication_date DESC NULLS LAST
          ) as rn
        FROM ${DB_SCHEMA}.sg_reports
        WHERE symbol ILIKE $1 || '%' OR proper_title ILIKE '%' || $1 || '%'
      )
      SELECT proper_title, symbol, un_body, date_year
      FROM ranked
      WHERE rn = 1
      ORDER BY 
        CASE WHEN symbol ILIKE $1 || '%' THEN 0 ELSE 1 END,
        date_year DESC NULLS LAST
      LIMIT 20`,
      [q]
    );

    return NextResponse.json({
      results: rows.map((r) => ({
        properTitle: r.proper_title,
        symbol: r.symbol,
        body: parseBodyString(r.un_body),
        year: r.date_year,
      })),
    });
  } catch (error) {
    console.error("Error searching reports:", error);
    return NextResponse.json(
      { error: "Failed to search reports" },
      { status: 500 }
    );
  }
}
