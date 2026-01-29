import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

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

interface SuggestionRow {
  proper_title: string;
  entity: string;
  source: string;
  confidence_score: number | null;
  symbol: string | null;
  un_body: string | null;
  date_year: number | null;
  is_confirmed: boolean;
}

/**
 * Get entity suggestions for a specific entity.
 * Returns deduplicated suggestions (most reliable source only per report).
 * Includes confirmation status.
 */
export async function GET(req: NextRequest) {
  const entity = req.nextUrl.searchParams.get("entity");
  
  if (!entity) {
    return NextResponse.json(
      { error: "entity parameter is required" },
      { status: 400 }
    );
  }

  // Optionally verify user is requesting their own entity's suggestions
  const user = await getCurrentUser();
  if (user && user.entity && user.entity !== entity) {
    // Allow viewing but could restrict if needed
  }

  try {
    // Query suggestions with deduplication by source reliability
    // Priority: dgacm (1) > dri (2) > ai (3)
    // Join with latest_versions to get report metadata
    // Join with confirmations to check if already confirmed
    const rows = await query<SuggestionRow>(
      `WITH ranked_suggestions AS (
        SELECT 
          s.proper_title,
          s.entity,
          s.source,
          s.confidence_score,
          ROW_NUMBER() OVER (
            PARTITION BY s.proper_title 
            ORDER BY CASE s.source 
              WHEN 'dgacm' THEN 1 
              WHEN 'dri' THEN 2 
              WHEN 'ai' THEN 3 
            END
          ) as rn
        FROM ${DB_SCHEMA}.report_entity_suggestions s
        WHERE s.entity = $1
      )
      SELECT 
        rs.proper_title,
        rs.entity,
        rs.source,
        rs.confidence_score,
        lv.symbol,
        lv.un_body,
        lv.effective_year as date_year,
        (c.id IS NOT NULL) as is_confirmed
      FROM ranked_suggestions rs
      INNER JOIN ${DB_SCHEMA}.latest_versions lv ON rs.proper_title = lv.proper_title
      LEFT JOIN ${DB_SCHEMA}.report_entity_confirmations c 
        ON rs.proper_title = c.proper_title AND rs.entity = c.entity
      WHERE rs.rn = 1
      ORDER BY 
        CASE rs.source 
          WHEN 'dgacm' THEN 1 
          WHEN 'dri' THEN 2 
          WHEN 'ai' THEN 3 
        END,
        lv.effective_year DESC NULLS LAST,
        rs.proper_title`,
      [entity]
    );

    return NextResponse.json({
      suggestions: rows.map((r) => ({
        properTitle: r.proper_title,
        symbol: r.symbol,
        body: parseBodyString(r.un_body),
        year: r.date_year,
        source: r.source,
        confidence: r.confidence_score,
        isConfirmed: r.is_confirmed,
      })),
      total: rows.length,
    });
  } catch (error) {
    console.error("Error fetching entity suggestions:", error);
    return NextResponse.json(
      { error: "Failed to fetch suggestions" },
      { status: 500 }
    );
  }
}
