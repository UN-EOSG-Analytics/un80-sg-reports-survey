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
  word_counts: (number | null)[];
  subject_terms_agg: (string[] | unknown)[];
  entities: (string | null)[];
  entities_manual: (string | null)[];
  entities_dri: (string | null)[];
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

interface CountItem {
  value: string;
  count: number;
}

interface SubjectCount {
  subject: string;
  count: number;
}

export async function GET(req: NextRequest) {
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");
  const offset = (page - 1) * limit;
  const symbol = req.nextUrl.searchParams.get("symbol");

  // Filter parameters
  const filterSymbol = req.nextUrl.searchParams.get("filterSymbol") || "";
  const filterTitle = req.nextUrl.searchParams.get("filterTitle") || "";
  const filterSearch = req.nextUrl.searchParams.get("filterSearch") || ""; // Unified search for symbol OR title
  const filterBodies = req.nextUrl.searchParams.getAll("filterBody");
  const filterYearMin = parseInt(req.nextUrl.searchParams.get("filterYearMin") || "") || null;
  const filterYearMax = parseInt(req.nextUrl.searchParams.get("filterYearMax") || "") || null;
  const filterFrequencies = req.nextUrl.searchParams.getAll("filterFrequency");
  const filterSubjects = req.nextUrl.searchParams.getAll("filterSubject");
  const filterEntities = req.nextUrl.searchParams.getAll("filterEntity"); // Filter by reporting entities

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
  // Exclude corrigenda (CORR), revisions (REV), and credentials reports
  const whereClauses: string[] = [
    "r.proper_title IS NOT NULL",
    "r.symbol NOT LIKE '%/CORR.%'",
    "r.symbol NOT LIKE '%/REV.%'",
    "NOT (r.subject_terms @> ARRAY['Representative''s credentials'])",
  ];
  const params: (string | number)[] = [];
  let paramIndex = 1;

  // Unified search: search in both symbol and title
  if (filterSearch) {
    whereClauses.push(`(r.symbol ILIKE $${paramIndex} OR r.proper_title ILIKE $${paramIndex})`);
    params.push(`%${filterSearch}%`);
    paramIndex++;
  }

  // Legacy individual filters (kept for backward compatibility)
  if (filterSymbol) {
    whereClauses.push(`r.symbol ILIKE $${paramIndex}`);
    params.push(`%${filterSymbol}%`);
    paramIndex++;
  }

  if (filterTitle) {
    whereClauses.push(`r.proper_title ILIKE $${paramIndex}`);
    params.push(`%${filterTitle}%`);
    paramIndex++;
  }

  if (filterBodies.length > 0) {
    // Handle PostgreSQL array format in un_body (e.g. '{"General Assembly"}')
    const bodyConditions = filterBodies.map((_, i) => `r.un_body LIKE '%' || $${paramIndex + i} || '%'`).join(' OR ');
    whereClauses.push(`(${bodyConditions})`);
    filterBodies.forEach((b) => params.push(b));
    paramIndex += filterBodies.length;
  }

  if (filterSubjects.length > 0) {
    whereClauses.push(`r.subject_terms && $${paramIndex}`);
    params.push(filterSubjects as unknown as string);
    paramIndex++;
  }

  // Entity filter (supports multiple)
  if (filterEntities.length > 0) {
    whereClauses.push(`re.entity = ANY($${paramIndex})`);
    params.push(filterEntities as unknown as string);
    paramIndex++;
  }

  const whereClause = whereClauses.join(" AND ");

  // Otherwise, return paginated list grouped by title
  // Use COALESCE to fall back to publication_date year when date_year is null
  // Extract year from publication_date using substring (format: YYYY-MM-DD or similar)
  const [reports, countResult, bodyCounts, yearRange, subjectCounts, entityCounts] = await Promise.all([
    query<ReportRow>(
      `SELECT 
        proper_title,
        array_agg(symbol ORDER BY effective_year DESC NULLS LAST, symbol) as symbols,
        array_agg(effective_year ORDER BY effective_year DESC NULLS LAST, symbol) as years,
        array_agg(un_body ORDER BY effective_year DESC NULLS LAST, symbol) as bodies,
        array_agg(publication_date ORDER BY effective_year DESC NULLS LAST, symbol) as publication_dates,
        array_agg(record_number ORDER BY effective_year DESC NULLS LAST, symbol) as record_numbers,
        array_agg(word_count ORDER BY effective_year DESC NULLS LAST, symbol) as word_counts,
        array_agg(to_json(COALESCE(subject_terms, ARRAY[]::text[])) ORDER BY effective_year DESC NULLS LAST, symbol) as subject_terms_agg,
        array_agg(entity ORDER BY effective_year DESC NULLS LAST, symbol) as entities,
        array_agg(entity_manual ORDER BY effective_year DESC NULLS LAST, symbol) as entities_manual,
        array_agg(entity_dri ORDER BY effective_year DESC NULLS LAST, symbol) as entities_dri,
        COUNT(*)::int as count,
        MAX(effective_year) as latest_year
      FROM (
        SELECT 
          r.proper_title,
          r.symbol,
          r.un_body,
          r.publication_date,
          r.record_number,
          r.word_count,
          r.subject_terms,
          re.entity,
          re.entity_manual,
          re.entity_dri,
          COALESCE(
            r.date_year,
            CASE 
              WHEN r.publication_date ~ '^\\d{4}' 
              THEN SUBSTRING(r.publication_date FROM 1 FOR 4)::int 
            END
          ) as effective_year
        FROM ${DB_SCHEMA}.reports r
        LEFT JOIN ${DB_SCHEMA}.reporting_entities re ON r.symbol = re.symbol
        WHERE ${whereClause}
      ) sub
      GROUP BY proper_title
      ORDER BY latest_year DESC NULLS LAST, proper_title
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    ),
    query<{ total: number }>(
      `SELECT COUNT(DISTINCT r.proper_title)::int as total
       FROM ${DB_SCHEMA}.reports r
       LEFT JOIN ${DB_SCHEMA}.reporting_entities re ON r.symbol = re.symbol
       WHERE ${whereClause}`,
      params
    ),
    // Body counts by distinct proper_title
    query<{ body: string; count: number }>(
      `SELECT un_body as body, COUNT(DISTINCT proper_title)::int as count 
       FROM ${DB_SCHEMA}.reports 
       WHERE un_body IS NOT NULL AND proper_title IS NOT NULL
       GROUP BY un_body ORDER BY count DESC`
    ),
    // Year range (min/max)
    query<{ min_year: number; max_year: number }>(
      `SELECT 
        MIN(COALESCE(date_year, CASE WHEN publication_date ~ '^\\d{4}' THEN SUBSTRING(publication_date FROM 1 FOR 4)::int END))::int as min_year,
        MAX(COALESCE(date_year, CASE WHEN publication_date ~ '^\\d{4}' THEN SUBSTRING(publication_date FROM 1 FOR 4)::int END))::int as max_year
       FROM ${DB_SCHEMA}.reports 
       WHERE proper_title IS NOT NULL`
    ),
    // Get subject term counts - count by unique report title (not by version/symbol)
    // Only include subjects that appear in more than one report (excluding credentials)
    query<SubjectCount>(
      `SELECT subject as subject, COUNT(DISTINCT proper_title)::int as count
       FROM ${DB_SCHEMA}.reports, unnest(subject_terms) as subject
       WHERE proper_title IS NOT NULL
         AND subject != 'Representative''s credentials'
       GROUP BY subject
       HAVING COUNT(DISTINCT proper_title) > 1
       ORDER BY count DESC, subject`
    ),
    // Entity counts by distinct proper_title
    query<{ entity: string; count: number }>(
      `SELECT re.entity, COUNT(DISTINCT r.proper_title)::int as count 
       FROM ${DB_SCHEMA}.reporting_entities re
       JOIN ${DB_SCHEMA}.reports r ON re.symbol = r.symbol
       WHERE re.entity IS NOT NULL AND r.proper_title IS NOT NULL
       GROUP BY re.entity ORDER BY count DESC`
    ),
  ]);

  // Parse PostgreSQL array string like {"General Assembly","Human Rights Bodies"} to extract first element
  function parseBodyString(bodyStr: string | null): string | null {
    if (!bodyStr) return null;
    // Check if it's a PostgreSQL array format
    if (bodyStr.startsWith('{') && bodyStr.endsWith('}')) {
      // Remove braces and split by comma (handling quoted strings)
      const inner = bodyStr.slice(1, -1);
      // Simple regex to match first quoted or unquoted value
      const match = inner.match(/^"([^"]+)"|^([^,]+)/);
      if (match) {
        return match[1] || match[2] || null;
      }
    }
    return bodyStr;
  }

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
    // Collect unique subject terms from all versions (now stored as JSON)
    const allSubjects = new Set<string>();
    r.subject_terms_agg?.forEach((terms) => {
      if (Array.isArray(terms)) {
        terms.forEach((t) => {
          if (typeof t === 'string') allSubjects.add(t);
        });
      }
    });
    // Get entity (prefer manual, then dri)
    const entity = r.entities?.[0] || null;
    const entityManual = r.entities_manual?.[0] || null;
    const entityDri = r.entities_dri?.[0] || null;
    return {
      title: r.proper_title?.replace(/\s*:\s*$/, "").trim(),
      symbol: r.symbols[0],
      body: parseBodyString(r.bodies[0]),
      year: r.years[0] || null,
      entity,
      entityManual,
      entityDri,
      versions: r.symbols.map((s, i) => ({
        symbol: s,
        year: r.years[i],
        publicationDate: r.publication_dates[i],
        recordNumber: r.record_numbers[i],
        wordCount: r.word_counts[i],
      })),
      count: r.count,
      latestYear: r.latest_year,
      frequency,
      subjectTerms: Array.from(allSubjects),
    };
  });

  // Apply year range filter
  if (filterYearMin !== null && filterYearMax !== null) {
    filteredReports = filteredReports.filter((r) => r.year && r.year >= filterYearMin && r.year <= filterYearMax);
  }

  // Apply frequency filter
  if (filterFrequencies.length > 0) {
    filteredReports = filteredReports.filter((r) => r.frequency && filterFrequencies.includes(r.frequency));
  }

  // Get unique frequencies from all data
  const allFrequencies = ["One-time", "Annual", "Biennial", "Triennial", "Quadrennial", "Quinquennial"];

  // Parse and dedupe body counts
  const bodyCountMap = new Map<string, number>();
  bodyCounts.forEach((b) => {
    const parsed = parseBodyString(b.body);
    if (parsed) bodyCountMap.set(parsed, (bodyCountMap.get(parsed) || 0) + b.count);
  });
  const parsedBodyCounts = Array.from(bodyCountMap.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    reports: filteredReports,
    total: countResult[0]?.total || 0,
    page,
    limit,
    filterOptions: {
      bodies: parsedBodyCounts,
      yearRange: { min: yearRange[0]?.min_year || 2000, max: yearRange[0]?.max_year || new Date().getFullYear() },
      frequencies: allFrequencies,
      entities: entityCounts.map((e) => ({ value: e.entity, count: e.count })),
    },
    subjectCounts: subjectCounts.map((s) => ({ subject: s.subject, count: s.count })),
  });
}
