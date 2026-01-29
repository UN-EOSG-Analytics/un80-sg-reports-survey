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
    // Source from documents table, results from latest_versions only
    const similar = await query<SimilarReport>(
      `WITH source AS (
        SELECT d.embedding, d.proper_title
        FROM ${DB_SCHEMA}.documents d
        WHERE d.symbol = $1
        AND d.embedding IS NOT NULL
      )
      SELECT 
        lv.symbol,
        lv.proper_title,
        lv.effective_year as year,
        1 - (lv.embedding <=> s.embedding) as similarity,
        lv.entity
      FROM ${DB_SCHEMA}.latest_versions lv
      CROSS JOIN source s
      WHERE lv.embedding IS NOT NULL
        AND (s.proper_title IS NULL OR lv.proper_title IS NULL OR TRIM(lv.proper_title) != TRIM(s.proper_title))
        AND lv.symbol != $1
      ORDER BY lv.embedding <=> s.embedding
      LIMIT $2`,
      [symbol, limit]
    );

    // If no embedding exists for the source report, return empty
    if (similar.length === 0) {
      const hasEmbedding = await query<{ has_embedding: boolean }>(
        `SELECT embedding IS NOT NULL as has_embedding 
         FROM ${DB_SCHEMA}.documents 
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
