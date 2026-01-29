import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

interface EntitySuggestion {
  entity: string;
  source: string;
  confidence_score: number | null;
}

interface EntityConfirmation {
  entity: string;
  confirmed_by_email: string;
  confirmed_at: string;
}

interface ReportRow {
  proper_title: string;
  symbols: string[];
  years: (number | null)[];
  bodies: (string | null)[];
  report_types: (string | null)[];
  publication_dates: (string | null)[];
  record_numbers: (string | null)[];
  word_counts: (number | null)[];
  subject_terms_agg: (string[] | unknown)[];
  suggested_entities: string[] | null;
  confirmed_entities: string[] | null;
  suggestions: EntitySuggestion[] | null;
  confirmations: EntityConfirmation[] | null;
  primary_entity: string | null;
  has_confirmation: boolean;
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
  based_on_resolution_symbols: string[] | null;
  text: string | null;
  raw_json: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface ResolutionInfo {
  symbol: string;
  title: string | null;
  date_year: number | null;
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
  
  // Mode: all (default), my (confirmed reports), suggested (suggestions for entity)
  const mode = req.nextUrl.searchParams.get("mode") || "all";
  const modeEntity = req.nextUrl.searchParams.get("entity"); // Required for mode=my and mode=suggested

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
  const filterReportTypes = req.nextUrl.searchParams.getAll("filterReportType"); // Filter by report type (Report/Note/Other)

  // If a specific symbol is requested, return that single report
  if (symbol) {
    const reports = await query<SingleReportRow>(
      `SELECT id, symbol, proper_title, title, date_year, publication_date,
              subject_terms, resource_type_level3, based_on_resolution_symbols,
              text, raw_json, created_at, updated_at
       FROM ${DB_SCHEMA}.documents
       WHERE symbol = $1`,
      [symbol]
    );

    if (reports.length === 0) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const report = reports[0];
    
    // Fetch resolution details if report has mandating resolutions
    let resolutions: ResolutionInfo[] = [];
    if (report.based_on_resolution_symbols && report.based_on_resolution_symbols.length > 0) {
      resolutions = await query<ResolutionInfo>(
        `SELECT symbol, proper_title as title, date_year
         FROM ${DB_SCHEMA}.documents
         WHERE symbol = ANY($1)`,
        [report.based_on_resolution_symbols]
      );
    }

    return NextResponse.json({
      ...report,
      resolutions,
    });
  }

  // Validate mode
  if ((mode === "my" || mode === "suggested") && !modeEntity) {
    return NextResponse.json({ error: "entity parameter required for mode=my or mode=suggested" }, { status: 400 });
  }

  // Build WHERE clauses for filters
  // Uses sg_reports view which already handles:
  // - Type filtering (resource_type_level3 or title match)
  // - proper_title IS NOT NULL
  // - CORR/REV exclusion
  // - Credentials exclusion
  const whereClauses: string[] = [];
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

  if (filterReportTypes.length > 0) {
    whereClauses.push(`r.report_type = ANY($${paramIndex})`);
    params.push(filterReportTypes as unknown as string);
    paramIndex++;
  }

  // Year range filter (on effective_year, filter on MAX year of the series)
  // We'll add this as a HAVING clause for proper_title groups
  const havingClauses: string[] = [];
  const havingParams: (string | number)[] = [];
  let havingParamIndex = paramIndex;

  // Mode-specific filtering
  // mode=my: Filter to reports confirmed by the specified entity
  // mode=suggested: Filter to reports suggested for the specified entity
  if (mode === "my" && modeEntity) {
    havingClauses.push(`(
      (SELECT re.confirmed_entities FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) @> ARRAY[$${havingParamIndex}]::text[]
    )`);
    havingParams.push(modeEntity);
    havingParamIndex++;
  } else if (mode === "suggested" && modeEntity) {
    havingClauses.push(`(
      (SELECT re.suggested_entities FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) @> ARRAY[$${havingParamIndex}]::text[]
    )`);
    havingParams.push(modeEntity);
    havingParamIndex++;
  }

  // Entity filter (supports multiple) - filter on suggested or confirmed entities
  // This needs to be in HAVING clause since we join with report_entities after grouping
  if (filterEntities.length > 0) {
    havingClauses.push(`(
      (SELECT re.suggested_entities FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) && $${havingParamIndex}::text[] 
      OR (SELECT re.confirmed_entities FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) && $${havingParamIndex}::text[]
    )`);
    havingParams.push(filterEntities as unknown as string);
    havingParamIndex++;
  }

  if (filterYearMin !== null) {
    havingClauses.push(`MAX(effective_year) >= $${havingParamIndex}`);
    havingParams.push(filterYearMin);
    havingParamIndex++;
  }
  if (filterYearMax !== null) {
    havingClauses.push(`MAX(effective_year) <= $${havingParamIndex}`);
    havingParams.push(filterYearMax);
    havingParamIndex++;
  }

  // Frequency filter - needs to be calculated and filtered in SQL
  // We'll use a CTE to calculate frequency and then filter
  const frequencyFilterSQL = filterFrequencies.length > 0
    ? `AND frequency = ANY($${havingParamIndex})`
    : "";
  if (filterFrequencies.length > 0) {
    havingParams.push(filterFrequencies as unknown as string);
    havingParamIndex++;
  }

  const whereClause = whereClauses.length > 0 ? whereClauses.join(" AND ") : "TRUE";
  const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : "";

  // Build the main query with CTE to calculate frequency
  const allParams = [...params, ...havingParams];
  const limitParamIndex = havingParamIndex;

  // Otherwise, return paginated list grouped by title
  // Use COALESCE to fall back to publication_date year when date_year is null
  // Extract year from publication_date using substring (format: YYYY-MM-DD or similar)
  const [reports, countResult, bodyCounts, yearRange, subjectCounts, entityCounts, reportTypeCounts] = await Promise.all([
    query<ReportRow & { frequency: string }>(
      `WITH grouped AS (
        SELECT 
          sub.proper_title,
          array_agg(symbol ORDER BY effective_year DESC NULLS LAST, symbol) as symbols,
          array_agg(effective_year ORDER BY effective_year DESC NULLS LAST, symbol) as years,
          array_agg(un_body ORDER BY effective_year DESC NULLS LAST, symbol) as bodies,
          array_agg(report_type ORDER BY effective_year DESC NULLS LAST, symbol) as report_types,
          array_agg(publication_date ORDER BY effective_year DESC NULLS LAST, symbol) as publication_dates,
          array_agg(record_number ORDER BY effective_year DESC NULLS LAST, symbol) as record_numbers,
          array_agg(word_count ORDER BY effective_year DESC NULLS LAST, symbol) as word_counts,
          array_agg(to_json(COALESCE(subject_terms, ARRAY[]::text[])) ORDER BY effective_year DESC NULLS LAST, symbol) as subject_terms_agg,
          -- Entity fields using scalar subqueries to avoid array_agg on JSONB
          (SELECT re.suggested_entities FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) as suggested_entities,
          (SELECT re.confirmed_entities FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) as confirmed_entities,
          (SELECT re.suggestions FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) as suggestions,
          (SELECT re.confirmations FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) as confirmations,
          (SELECT re.primary_entity FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) as primary_entity,
          (SELECT COALESCE(re.has_confirmation, false) FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) as has_confirmation,
          COUNT(*)::int as count,
          MAX(effective_year) as latest_year
        FROM (
          SELECT 
            r.proper_title,
            r.symbol,
            r.un_body,
            r.report_type,
            r.publication_date,
            r.record_number,
            r.word_count,
            r.subject_terms,
            COALESCE(
              r.date_year,
              CASE 
                WHEN r.publication_date ~ '^\\d{4}' 
                THEN SUBSTRING(r.publication_date FROM 1 FOR 4)::int 
              END
            ) as effective_year
          FROM ${DB_SCHEMA}.sg_reports r
          WHERE ${whereClause}
        ) sub
        GROUP BY sub.proper_title
        ${havingClause}
      ),
      with_frequency AS (
        SELECT *,
          CASE 
            WHEN count = 1 THEN 'One-time'
            WHEN (SELECT COUNT(DISTINCT y) FROM unnest(years) y WHERE y IS NOT NULL) < 2 THEN 'One-time'
            ELSE (
              SELECT CASE 
                WHEN gap = 1 THEN 'Annual'
                WHEN gap = 2 THEN 'Biennial'
                WHEN gap = 3 THEN 'Triennial'
                WHEN gap = 4 THEN 'Quadrennial'
                WHEN gap = 5 THEN 'Quinquennial'
                ELSE 'Every ' || gap || ' years'
              END
              FROM (
                SELECT (sorted_years[1] - sorted_years[2]) as gap
                FROM (
                  SELECT ARRAY(SELECT DISTINCT y FROM unnest(years) y WHERE y IS NOT NULL ORDER BY y DESC LIMIT 2) as sorted_years
                ) t
              ) t2
            )
          END as frequency
        FROM grouped
      )
      SELECT * FROM with_frequency
      WHERE 1=1 ${frequencyFilterSQL}
      ORDER BY latest_year DESC NULLS LAST, proper_title
      LIMIT $${limitParamIndex} OFFSET $${limitParamIndex + 1}`,
      [...allParams, limit, offset]
    ),
    // Count query with same filters
    query<{ total: number }>(
      `WITH grouped AS (
        SELECT 
          sub.proper_title,
          array_agg(effective_year ORDER BY effective_year DESC NULLS LAST) as years,
          COUNT(*)::int as count,
          MAX(effective_year) as latest_year
        FROM (
          SELECT 
            r.proper_title,
            COALESCE(
              r.date_year,
              CASE 
                WHEN r.publication_date ~ '^\\d{4}' 
                THEN SUBSTRING(r.publication_date FROM 1 FOR 4)::int 
              END
            ) as effective_year
          FROM ${DB_SCHEMA}.sg_reports r
          WHERE ${whereClause}
        ) sub
        LEFT JOIN ${DB_SCHEMA}.report_entities re ON sub.proper_title = re.proper_title
        GROUP BY sub.proper_title
        ${havingClause}
      ),
      with_frequency AS (
        SELECT *,
          CASE 
            WHEN count = 1 THEN 'One-time'
            WHEN (SELECT COUNT(DISTINCT y) FROM unnest(years) y WHERE y IS NOT NULL) < 2 THEN 'One-time'
            ELSE (
              SELECT CASE 
                WHEN gap = 1 THEN 'Annual'
                WHEN gap = 2 THEN 'Biennial'
                WHEN gap = 3 THEN 'Triennial'
                WHEN gap = 4 THEN 'Quadrennial'
                WHEN gap = 5 THEN 'Quinquennial'
                ELSE 'Every ' || gap || ' years'
              END
              FROM (
                SELECT (sorted_years[1] - sorted_years[2]) as gap
                FROM (
                  SELECT ARRAY(SELECT DISTINCT y FROM unnest(years) y WHERE y IS NOT NULL ORDER BY y DESC LIMIT 2) as sorted_years
                ) t
              ) t2
            )
          END as frequency
        FROM grouped
      )
      SELECT COUNT(*)::int as total FROM with_frequency
      WHERE 1=1 ${frequencyFilterSQL}`,
      allParams
    ),
    // Body counts (from latest_versions view - one per series)
    query<{ body: string; count: number }>(
      `SELECT un_body as body, COUNT(*)::int as count 
       FROM ${DB_SCHEMA}.latest_versions 
       WHERE un_body IS NOT NULL
       GROUP BY un_body ORDER BY count DESC`
    ),
    // Year range (from latest_versions view)
    query<{ min_year: number; max_year: number }>(
      `SELECT MIN(effective_year)::int as min_year, MAX(effective_year)::int as max_year
       FROM ${DB_SCHEMA}.latest_versions`
    ),
    // Subject term counts (from latest_versions - one per series)
    // Credentials already excluded by sg_reports view
    query<SubjectCount>(
      `SELECT subject, COUNT(*)::int as count
       FROM ${DB_SCHEMA}.latest_versions, unnest(subject_terms) as subject
       GROUP BY subject
       HAVING COUNT(*) > 1
       ORDER BY count DESC, subject`
    ),
    // Entity counts (from report_entity_suggestions - all suggested entities)
    query<{ entity: string; count: number }>(
      `SELECT entity, COUNT(DISTINCT proper_title)::int as count 
       FROM ${DB_SCHEMA}.report_entity_suggestions
       GROUP BY entity 
       ORDER BY count DESC`
    ),
    // Report type counts (from latest_versions - one per series)
    query<{ report_type: string; count: number }>(
      `SELECT report_type, COUNT(*)::int as count 
       FROM ${DB_SCHEMA}.latest_versions
       WHERE report_type IS NOT NULL
       GROUP BY report_type 
       ORDER BY count DESC`
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

  // Transform reports to response format (frequency is now calculated in SQL)
  const filteredReports = reports.map((r) => {
    // Collect unique subject terms from all versions (now stored as JSON)
    const allSubjects = new Set<string>();
    r.subject_terms_agg?.forEach((terms) => {
      if (Array.isArray(terms)) {
        terms.forEach((t) => {
          if (typeof t === 'string') allSubjects.add(t);
        });
      }
    });
    
    return {
      title: r.proper_title || null,  // Keep original proper_title for database matching
      symbol: r.symbols[0],
      body: parseBodyString(r.bodies[0]),
      reportType: r.report_types?.[0] || 'Other', // Report type (Report/Note/Other)
      year: r.years[0] || null,
      // New entity structure
      entity: r.primary_entity || null, // Primary entity (confirmed first, then best suggestion)
      suggestedEntities: r.suggested_entities || [],
      confirmedEntities: r.confirmed_entities || [],
      suggestions: r.suggestions || [],
      confirmations: r.confirmations || [],
      hasConfirmation: r.has_confirmation || false,
      versions: r.symbols.map((s, i) => ({
        symbol: s,
        year: r.years[i],
        publicationDate: r.publication_dates[i],
        recordNumber: r.record_numbers[i],
        wordCount: r.word_counts[i],
      })),
      count: r.count,
      latestYear: r.latest_year,
      frequency: r.frequency, // Use frequency calculated in SQL
      subjectTerms: Array.from(allSubjects),
    };
  });

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
    mode,
    entity: modeEntity || null,
    filterOptions: {
      bodies: parsedBodyCounts,
      yearRange: { min: yearRange[0]?.min_year || 2000, max: yearRange[0]?.max_year || new Date().getFullYear() },
      frequencies: allFrequencies,
      entities: entityCounts.map((e) => ({ value: e.entity, count: e.count })),
      reportTypes: reportTypeCounts.map((t) => ({ value: t.report_type, count: t.count })),
    },
    subjectCounts: subjectCounts.map((s) => ({ subject: s.subject, count: s.count })),
  });
}
