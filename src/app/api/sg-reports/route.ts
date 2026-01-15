import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

interface ReportRow {
  proper_title: string;
  symbols: string[];
  years: (number | null)[];
  bodies: (string | null)[];
  publication_dates: (string | null)[];
  record_numbers: (string | null)[];
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

  // Filter parameters
  const filterSymbol = req.nextUrl.searchParams.get("filterSymbol") || "";
  const filterTitle = req.nextUrl.searchParams.get("filterTitle") || "";
  const filterBodies = req.nextUrl.searchParams.getAll("filterBody");
  const filterYears = req.nextUrl.searchParams.getAll("filterYear").map(Number).filter(Boolean);
  const filterFrequencies = req.nextUrl.searchParams.getAll("filterFrequency");

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

  // Build WHERE clauses for filters
  const whereClauses: string[] = ["proper_title IS NOT NULL"];
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (filterSymbol) {
    whereClauses.push(`symbol ILIKE $${paramIndex}`);
    params.push(`%${filterSymbol}%`);
    paramIndex++;
  }

  if (filterTitle) {
    whereClauses.push(`proper_title ILIKE $${paramIndex}`);
    params.push(`%${filterTitle}%`);
    paramIndex++;
  }

  if (filterBodies.length > 0) {
    whereClauses.push(`un_body = ANY($${paramIndex})`);
    params.push(filterBodies as unknown as string);
    paramIndex++;
  }

  const whereClause = whereClauses.join(" AND ");

  // Otherwise, return paginated list grouped by title
  // Use COALESCE to fall back to publication_date year when date_year is null
  // Extract year from publication_date using substring (format: YYYY-MM-DD or similar)
  const [reports, countResult, distinctBodies, distinctYears] = await Promise.all([
    query<ReportRow>(
      `SELECT 
        proper_title,
        array_agg(symbol ORDER BY effective_year DESC NULLS LAST, symbol) as symbols,
        array_agg(effective_year ORDER BY effective_year DESC NULLS LAST, symbol) as years,
        array_agg(un_body ORDER BY effective_year DESC NULLS LAST, symbol) as bodies,
        array_agg(publication_date ORDER BY effective_year DESC NULLS LAST, symbol) as publication_dates,
        array_agg(record_number ORDER BY effective_year DESC NULLS LAST, symbol) as record_numbers,
        COUNT(*)::int as count,
        MAX(effective_year) as latest_year
      FROM (
        SELECT 
          proper_title,
          symbol,
          un_body,
          publication_date,
          record_number,
          COALESCE(
            date_year,
            CASE 
              WHEN publication_date ~ '^\\d{4}' 
              THEN SUBSTRING(publication_date FROM 1 FOR 4)::int 
            END
          ) as effective_year
        FROM ${DB_SCHEMA}.reports
        WHERE ${whereClause}
      ) sub
      GROUP BY proper_title
      ORDER BY latest_year DESC NULLS LAST, proper_title
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    ),
    query<{ total: number }>(
      `SELECT COUNT(DISTINCT proper_title)::int as total
       FROM ${DB_SCHEMA}.reports
       WHERE ${whereClause}`,
      params
    ),
    query<{ body: string }>(
      `SELECT DISTINCT un_body as body FROM ${DB_SCHEMA}.reports 
       WHERE un_body IS NOT NULL ORDER BY un_body`
    ),
    query<{ year: number }>(
      `SELECT DISTINCT COALESCE(
        date_year,
        CASE WHEN publication_date ~ '^\\d{4}' 
        THEN SUBSTRING(publication_date FROM 1 FOR 4)::int END
      ) as year
      FROM ${DB_SCHEMA}.reports 
      WHERE proper_title IS NOT NULL
      ORDER BY year DESC NULLS LAST`
    ),
  ]);

  // Calculate frequency from the gap between the two most recent distinct years
  function calculateFrequency(years: (number | null)[], count: number): string {
    if (count === 1) return "One-time";
    
    const distinctYears = [...new Set(years.filter((y): y is number => y !== null))].sort((a, b) => b - a);
    if (distinctYears.length < 2) return "One-time";
    
    const gap = distinctYears[0] - distinctYears[1];
    if (gap === 1) return "Annual";
    if (gap === 2) return "Biennial";
    if (gap === 3) return "Triennial";
    if (gap === 4) return "Quadrennial";
    if (gap === 5) return "Quinquennial";
    if (gap > 5) return `Every ${gap} years`;
    return "One-time";
  }

  // Post-filter by year and frequency (done after grouping)
  let filteredReports = reports.map((r) => {
    const frequency = calculateFrequency(r.years, r.count);
    return {
      title: r.proper_title?.replace(/\s*:\s*$/, "").trim(),
      symbol: r.symbols[0],
      body: r.bodies[0] || null,
      year: r.years[0] || null,
      versions: r.symbols.map((s, i) => ({
        symbol: s,
        year: r.years[i],
        publicationDate: r.publication_dates[i],
        recordNumber: r.record_numbers[i],
      })),
      count: r.count,
      latestYear: r.latest_year,
      frequency,
    };
  });

  // Apply year filter
  if (filterYears.length > 0) {
    filteredReports = filteredReports.filter((r) => r.year && filterYears.includes(r.year));
  }

  // Apply frequency filter
  if (filterFrequencies.length > 0) {
    filteredReports = filteredReports.filter((r) => r.frequency && filterFrequencies.includes(r.frequency));
  }

  // Get unique frequencies from all data
  const allFrequencies = ["One-time", "Annual", "Biennial", "Triennial", "Quadrennial", "Quinquennial"];

  return NextResponse.json({
    reports: filteredReports,
    total: countResult[0]?.total || 0,
    page,
    limit,
    filterOptions: {
      bodies: distinctBodies.map((b) => b.body),
      years: distinctYears.map((y) => y.year).filter((y): y is number => y !== null),
      frequencies: allFrequencies,
    },
  });
}
