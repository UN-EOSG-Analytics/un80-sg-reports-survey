import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  const rows = await query<{ entity: string; entity_long: string | null }>(
    `SELECT entity, entity_long FROM systemchart.entities ORDER BY entity`
  );
  return NextResponse.json({ 
    entities: rows.map((r) => ({ 
      short: r.entity, 
      long: r.entity_long 
    })) 
  });
}
