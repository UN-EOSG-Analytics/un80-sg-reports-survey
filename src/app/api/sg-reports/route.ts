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
  role?: string;
  confirmed_by_email: string;
  confirmed_at: string;
}

interface ReportRow {
  proper_title: string;
  normalized_body: string | null;  // Normalized body for grouping
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
  lead_entities: string[] | null;
  contributing_entities: string[] | null;
  suggestions: EntitySuggestion[] | null;
  confirmations: EntityConfirmation[] | null;
  primary_entity: string | null;
  has_confirmation: boolean;
  count: number;
  latest_year: number | null;
  // Frequency fields
  calculated_frequency: string | null;
  confirmed_frequency: string | null;
  gap_history: number[] | null;
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

interface MandateInfo {
  summary: string | null;
  explicit_frequency: string | null;
  implicit_frequency: string | null;
  frequency_reasoning: string | null;
  verbatim_paragraph: string | null;
}

interface ResolutionInfo {
  symbol: string;
  title: string | null;
  date_year: number | null;
  mandates: MandateInfo[];
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
  const filterYears = req.nextUrl.searchParams.getAll("filterYear").map(y => parseInt(y)).filter(y => !isNaN(y)); // Array of years
  const filterFrequencies = req.nextUrl.searchParams.getAll("filterFrequency");
  const filterSubjects = req.nextUrl.searchParams.getAll("filterSubject");
  const filterEntities = req.nextUrl.searchParams.getAll("filterEntity"); // Filter by reporting entities
  const filterReportTypes = req.nextUrl.searchParams.getAll("filterReportType"); // Filter by report type (Report/Note/Other)
  
  // Survey focus years (2023 to present) - base filter applied to all queries
  const currentYear = new Date().getFullYear();
  const SURVEY_YEARS = Array.from({ length: currentYear - 2023 + 1 }, (_, i) => 2023 + i);

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
    
    // Fetch resolution details with mandate info if report has mandating resolutions
    let resolutions: ResolutionInfo[] = [];
    if (report.based_on_resolution_symbols && report.based_on_resolution_symbols.length > 0) {
      const resolutionRows = await query<{
        symbol: string;
        title: string | null;
        date_year: number | null;
        mandates: MandateInfo[] | null;
      }>(
        `SELECT 
           d.symbol, 
           d.proper_title as title, 
           d.date_year,
           COALESCE(
             (SELECT json_agg(
               json_build_object(
                 'summary', rm.summary,
                 'explicit_frequency', rm.explicit_frequency,
                 'implicit_frequency', rm.implicit_frequency,
                 'frequency_reasoning', rm.frequency_reasoning,
                 'verbatim_paragraph', rm.verbatim_paragraph
               )
             )
             FROM ${DB_SCHEMA}.resolution_mandates rm 
             WHERE rm.resolution_symbol = d.symbol),
             '[]'::json
           ) as mandates
         FROM ${DB_SCHEMA}.documents d
         WHERE d.symbol = ANY($1)`,
        [report.based_on_resolution_symbols]
      );
      resolutions = resolutionRows.map(r => ({
        ...r,
        mandates: r.mandates || [],
      }));
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
  // Note: Entity confirmations are shared across bodies (keyed by proper_title only)
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
  // Note: Entity confirmations are shared across bodies (keyed by proper_title only)
  if (filterEntities.length > 0) {
    havingClauses.push(`(
      (SELECT re.suggested_entities FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) && $${havingParamIndex}::text[] 
      OR (SELECT re.confirmed_entities FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) && $${havingParamIndex}::text[]
    )`);
    havingParams.push(filterEntities as unknown as string);
    havingParamIndex++;
  }

  // Year filter if user selected specific years (base 2023-2025 filtering done in sg_reports view)
  if (filterYears.length > 0) {
    havingClauses.push(`MAX(effective_year) = ANY($${havingParamIndex}::int[])`);
    havingParams.push(filterYears as unknown as string);
    havingParamIndex++;
  }

  // Frequency filter - now uses pre-computed values from report_frequencies table
  // Filter on confirmed frequency first, fallback to calculated
  const frequencyFilterSQL = filterFrequencies.length > 0
    ? `AND COALESCE(confirmed_frequency, calculated_frequency) = ANY($${havingParamIndex})`
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

  // Otherwise, return paginated list grouped by title AND body
  // Reports with the same title but different bodies (e.g., GA vs ECOSOC) are now separate groups
  // Use COALESCE to fall back to publication_date year when date_year is null
  // Extract year from publication_date using substring (format: YYYY-MM-DD or similar)
  const [reports, countResult, bodyCounts, yearsResult, subjectCounts, entityCounts, reportTypeCounts] = await Promise.all([
    query<ReportRow>(
      `WITH grouped AS (
        SELECT 
          sub.proper_title,
          sub.normalized_body,
          array_agg(symbol ORDER BY effective_year DESC NULLS LAST, symbol) as symbols,
          array_agg(effective_year ORDER BY effective_year DESC NULLS LAST, symbol) as years,
          array_agg(un_body ORDER BY effective_year DESC NULLS LAST, symbol) as bodies,
          array_agg(report_type ORDER BY effective_year DESC NULLS LAST, symbol) as report_types,
          array_agg(publication_date ORDER BY effective_year DESC NULLS LAST, symbol) as publication_dates,
          array_agg(record_number ORDER BY effective_year DESC NULLS LAST, symbol) as record_numbers,
          array_agg(word_count ORDER BY effective_year DESC NULLS LAST, symbol) as word_counts,
          array_agg(to_json(COALESCE(subject_terms, ARRAY[]::text[])) ORDER BY effective_year DESC NULLS LAST, symbol) as subject_terms_agg,
          -- Entity fields using scalar subqueries (shared across bodies, keyed by proper_title only)
          (SELECT re.suggested_entities FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) as suggested_entities,
          (SELECT re.confirmed_entities FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) as confirmed_entities,
          (SELECT re.lead_entities FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) as lead_entities,
          (SELECT re.contributing_entities FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) as contributing_entities,
          (SELECT re.suggestions FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) as suggestions,
          (SELECT re.confirmations FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) as confirmations,
          (SELECT re.primary_entity FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) as primary_entity,
          (SELECT COALESCE(re.has_confirmation, false) FROM ${DB_SCHEMA}.report_entities re WHERE re.proper_title = sub.proper_title) as has_confirmation,
          -- Pre-computed frequency from report_frequencies table (per body)
          (SELECT rf.calculated_frequency FROM ${DB_SCHEMA}.report_frequencies rf 
           WHERE rf.proper_title = sub.proper_title 
           AND rf.normalized_body = COALESCE(sub.normalized_body, '')) as calculated_frequency,
          (SELECT rf.gap_history FROM ${DB_SCHEMA}.report_frequencies rf 
           WHERE rf.proper_title = sub.proper_title 
           AND rf.normalized_body = COALESCE(sub.normalized_body, '')) as gap_history,
          -- User-confirmed frequency (per body)
          (SELECT rfc.frequency FROM ${DB_SCHEMA}.report_frequency_confirmations rfc 
           WHERE rfc.proper_title = sub.proper_title
           AND rfc.normalized_body = COALESCE(sub.normalized_body, '')) as confirmed_frequency,
          COUNT(*)::int as count,
          MAX(effective_year) as latest_year
        FROM (
          SELECT 
            r.proper_title,
            r.symbol,
            r.un_body,
            -- Normalize body from symbol prefix (more reliable than un_body which can contain multiple bodies)
            CASE 
              WHEN r.symbol LIKE 'A/%' THEN 'General Assembly'
              WHEN r.symbol LIKE 'E/%' THEN 'Economic and Social Council'
              WHEN r.symbol LIKE 'S/%' THEN 'Security Council'
              WHEN r.symbol LIKE 'A/HRC/%' THEN 'Human Rights Council'
              ELSE COALESCE(
                CASE 
                  WHEN r.un_body LIKE '{%}' THEN SUBSTRING(r.un_body FROM '^\\{"?([^",}]+)"?')
                  ELSE r.un_body
                END,
                'Other'
              )
            END as normalized_body,
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
        GROUP BY sub.proper_title, sub.normalized_body
        ${havingClause}
      )
      SELECT * FROM grouped
      WHERE 1=1 ${frequencyFilterSQL}
      ORDER BY latest_year DESC NULLS LAST, proper_title, normalized_body
      LIMIT $${limitParamIndex} OFFSET $${limitParamIndex + 1}`,
      [...allParams, limit, offset]
    ),
    // Count query with same filters (grouped by title AND body)
    query<{ total: number }>(
      `WITH grouped AS (
        SELECT 
          sub.proper_title,
          sub.normalized_body,
          -- Pre-computed frequency from report_frequencies table (per body)
          (SELECT rf.calculated_frequency FROM ${DB_SCHEMA}.report_frequencies rf 
           WHERE rf.proper_title = sub.proper_title 
           AND rf.normalized_body = COALESCE(sub.normalized_body, '')) as calculated_frequency,
          -- User-confirmed frequency (per body)
          (SELECT rfc.frequency FROM ${DB_SCHEMA}.report_frequency_confirmations rfc 
           WHERE rfc.proper_title = sub.proper_title
           AND rfc.normalized_body = COALESCE(sub.normalized_body, '')) as confirmed_frequency,
          COUNT(*)::int as count,
          MAX(effective_year) as latest_year
        FROM (
          SELECT 
            r.proper_title,
            -- Normalize body from symbol prefix (more reliable than un_body which can contain multiple bodies)
            CASE 
              WHEN r.symbol LIKE 'A/%' THEN 'General Assembly'
              WHEN r.symbol LIKE 'E/%' THEN 'Economic and Social Council'
              WHEN r.symbol LIKE 'S/%' THEN 'Security Council'
              WHEN r.symbol LIKE 'A/HRC/%' THEN 'Human Rights Council'
              ELSE COALESCE(
                CASE 
                  WHEN r.un_body LIKE '{%}' THEN SUBSTRING(r.un_body FROM '^\\{"?([^",}]+)"?')
                  ELSE r.un_body
                END,
                'Other'
              )
            END as normalized_body,
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
        GROUP BY sub.proper_title, sub.normalized_body
        ${havingClause}
      )
      SELECT COUNT(*)::int as total FROM grouped
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
    // Years available for filtering (hardcoded to survey focus years)
    Promise.resolve([{ years: SURVEY_YEARS }]),
    // Subject term counts (from latest_versions - one per series)
    // Credentials already excluded by sg_reports view
    query<SubjectCount>(
      `SELECT subject, COUNT(*)::int as count
       FROM ${DB_SCHEMA}.latest_versions, unnest(subject_terms) as subject
       GROUP BY subject
       HAVING COUNT(*) > 1
       ORDER BY count DESC, subject`
    ),
    // Entity counts (from report_entity_suggestions, filtered to 2023+ via latest_versions)
    query<{ entity: string; count: number }>(
      `SELECT rs.entity, COUNT(DISTINCT rs.proper_title)::int as count 
       FROM ${DB_SCHEMA}.report_entity_suggestions rs
       INNER JOIN ${DB_SCHEMA}.latest_versions lv ON rs.proper_title = lv.proper_title
       GROUP BY rs.entity 
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

  // Helper to format frequency for display (capitalize first letter)
  function formatFrequency(freq: string | null): string | null {
    if (!freq) return null;
    // Map internal values to display values
    const displayMap: Record<string, string> = {
      'annual': 'Annual',
      'biennial': 'Biennial',
      'triennial': 'Triennial',
      'quadrennial': 'Quadrennial',
      'quinquennial': 'Quinquennial',
      'one-time': 'One-time',
      'other': 'Other',
      'irregular': 'Irregular',
    };
    return displayMap[freq] || freq.charAt(0).toUpperCase() + freq.slice(1);
  }

  // Transform reports to response format
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
    
    // Effective frequency: confirmed takes precedence over calculated
    const effectiveFrequency = r.confirmed_frequency || r.calculated_frequency;
    
    return {
      title: r.proper_title || null,  // Keep original proper_title for database matching
      symbol: r.symbols[0],
      body: r.normalized_body || parseBodyString(r.bodies[0]),  // Use normalized body from grouping
      reportType: r.report_types?.[0] || 'Other', // Report type (Report/Note/Other)
      year: r.years[0] || null,
      // New entity structure
      entity: r.primary_entity || null, // Primary entity (confirmed first, then best suggestion)
      suggestedEntities: r.suggested_entities || [],
      confirmedEntities: r.confirmed_entities || [],
      leadEntities: r.lead_entities || [],
      contributingEntities: r.contributing_entities || [],
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
      // Frequency fields - both calculated and confirmed
      frequency: formatFrequency(effectiveFrequency), // Display frequency (confirmed or calculated)
      calculatedFrequency: formatFrequency(r.calculated_frequency),
      confirmedFrequency: formatFrequency(r.confirmed_frequency),
      gapHistory: r.gap_history || null,
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
      years: yearsResult[0]?.years || SURVEY_YEARS,
      frequencies: allFrequencies,
      entities: entityCounts.map((e) => ({ value: e.entity, count: e.count })),
      reportTypes: reportTypeCounts.map((t) => ({ value: t.report_type, count: t.count })),
    },
    subjectCounts: subjectCounts.map((s) => ({ subject: s.subject, count: s.count })),
  });
}
