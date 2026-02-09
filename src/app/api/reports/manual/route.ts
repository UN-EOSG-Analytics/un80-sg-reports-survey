import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

interface ManualReportInput {
  symbol: string;
  properTitle: string;
  title: string;
  dateYear: number;
  unBody?: string;
  mandateResolutions?: string[];
}

interface DocumentRow {
  id: number;
  symbol: string;
  proper_title: string;
  title: string;
  date_year: number;
  un_body: string | null;
  based_on_resolution_symbols: string[] | null;
  data_source: string;
  created_by_user_id: string | null;
}

// Validate UN document symbol format (e.g., A/78/123, S/2024/100, E/2024/5)
function isValidSymbol(symbol: string): boolean {
  return /^[ASEH]\/(?:RES\/)?(?:HRC\/(?:RES\/)?)?[\w\/-]+$/.test(symbol.trim());
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: ManualReportInput = await req.json();

  // Validate required fields
  if (!body.symbol?.trim() || !body.properTitle?.trim() || !body.title?.trim() || !body.dateYear || !body.unBody?.trim()) {
    return NextResponse.json(
      { error: "Missing required fields: symbol, title, year, UN body" },
      { status: 400 }
    );
  }

  const symbol = body.symbol.trim().toUpperCase();
  const properTitle = body.properTitle.trim();
  const title = body.title.trim();
  const dateYear = body.dateYear;
  const unBody = body.unBody!.trim();

  // Validate symbol format
  if (!isValidSymbol(symbol)) {
    return NextResponse.json(
      { error: "Invalid symbol format. Expected format like A/78/123 or S/2024/100" },
      { status: 400 }
    );
  }

  // Validate year range
  if (dateYear < 2023 || dateYear > new Date().getFullYear() + 1) {
    return NextResponse.json(
      { error: "Year must be between 2023 and next year" },
      { status: 400 }
    );
  }

  // Check if symbol already exists
  const existing = await query<{ symbol: string }>(
    `SELECT symbol FROM ${DB_SCHEMA}.documents WHERE symbol = $1`,
    [symbol]
  );
  if (existing.length > 0) {
    return NextResponse.json(
      { error: "A document with this symbol already exists" },
      { status: 409 }
    );
  }

  // Parse symbol parts
  const symbolParts = symbol.split("/");
  const symbolWithoutPrefix = symbolParts.slice(1).join("/");

  // Determine resource type based on symbol prefix
  const resourceType = symbol.startsWith("A/RES/") || symbol.startsWith("S/RES/")
    ? ["Resolutions and Decisions"]
    : symbol.includes("/L.") || symbol.includes("/Add.")
    ? ["Letters and Notes Verbales"]
    : ["Reports"];

  const result = await query<DocumentRow>(
    `INSERT INTO ${DB_SCHEMA}.documents (
      symbol,
      symbol_split,
      symbol_split_n,
      proper_title,
      title,
      date_year,
      un_body,
      based_on_resolution_symbols,
      resource_type_level2,
      symbol_without_prefix,
      symbol_without_prefix_split,
      symbol_without_prefix_split_n,
      data_source,
      created_by_user_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'manual', $13)
    RETURNING id, symbol, proper_title, title, date_year, un_body, based_on_resolution_symbols, data_source, created_by_user_id`,
    [
      symbol,
      symbolParts,
      symbolParts.length,
      properTitle,
      title,
      dateYear,
      unBody,
      body.mandateResolutions?.length ? body.mandateResolutions : null,
      resourceType,
      symbolWithoutPrefix,
      symbolWithoutPrefix.split("/"),
      symbolWithoutPrefix.split("/").length,
      user.id,
    ]
  );

  const row = result[0];
  return NextResponse.json({
    success: true,
    document: {
      id: row.id,
      symbol: row.symbol,
      properTitle: row.proper_title,
      title: row.title,
      dateYear: row.date_year,
      unBody: row.un_body,
      mandateResolutions: row.based_on_resolution_symbols,
      dataSource: row.data_source,
    },
  });
}
