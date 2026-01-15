import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

interface SimilarReport {
  symbol: string;
  proper_title: string;
  year: number | null;
  similarity: number;
  entity: string | null;
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "5");

  if (!symbol) {
    return NextResponse.json(
      { error: "Symbol parameter is required" },
      { status: 400 }
    );
  }

  try {
    // Find similar reports using vector similarity search
    // Excludes other versions of the same report (same proper_title)
    const similar = await query<SimilarReport>(
      `WITH source AS (
        SELECT embedding, proper_title
        FROM ${DB_SCHEMA}.reports
        WHERE symbol = $1
        AND embedding IS NOT NULL
      )
      SELECT 
        r.symbol,
        r.proper_title,
        COALESCE(
          r.date_year,
          CASE WHEN r.publication_date ~ '^\\d{4}' 
          THEN SUBSTRING(r.publication_date FROM 1 FOR 4)::int END
        ) as year,
        1 - (r.embedding <=> s.embedding) as similarity,
        COALESCE(r.entity_manual, r.entity_dri) as entity
      FROM ${DB_SCHEMA}.reports r
      CROSS JOIN source s
      WHERE r.embedding IS NOT NULL
        AND r.proper_title IS DISTINCT FROM s.proper_title
        AND r.symbol != $1
        AND r.symbol NOT LIKE '%/CORR.%'
        AND r.symbol NOT LIKE '%/REV.%'
      ORDER BY r.embedding <=> s.embedding
      LIMIT $2`,
      [symbol, limit]
    );

    // If no embedding exists for the source report, return empty
    if (similar.length === 0) {
      // Check if the source report has an embedding
      const hasEmbedding = await query<{ has_embedding: boolean }>(
        `SELECT embedding IS NOT NULL as has_embedding 
         FROM ${DB_SCHEMA}.reports 
         WHERE symbol = $1`,
        [symbol]
      );

      if (!hasEmbedding[0]?.has_embedding) {
        return NextResponse.json({
          similar: [],
          message: "Source report does not have an embedding yet",
        });
      }
    }

    return NextResponse.json({
      similar: similar.map((r) => ({
        symbol: r.symbol,
        title: r.proper_title?.replace(/\s*:\s*$/, "").trim(),
        year: r.year,
        similarity: Math.round(r.similarity * 100) / 100,
        entity: r.entity,
      })),
    });
  } catch (error) {
    console.error("Error finding similar reports:", error);
    return NextResponse.json(
      { error: "Failed to find similar reports" },
      { status: 500 }
    );
  }
}
