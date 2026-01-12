import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  const rows = await query<{ entity: string; entity_long: string | null }>(
    `SELECT DISTINCT entity, entity_long FROM ppb2026.source_document_citations WHERE entity IS NOT NULL ORDER BY entity`
  );
  return NextResponse.json({ 
    entities: rows.map((r) => ({ 
      short: r.entity, 
      long: r.entity_long 
    })) 
  });
}
