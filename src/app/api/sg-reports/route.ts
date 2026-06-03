import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

interface EntitySuggestion {
  entity: string;
  source: string;
  confidence_score: number | null;
}

interface ReportRow {
  proper_title: string;
  normalized_body: string | null;
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
  primary_entity: string | null;
  has_confirmation: boolean;
  count: number;
  latest_year: number | null;
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

interface SubjectCount {
  subject: string;
  count: number;
}

export async function GET(req: NextRequest) {
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");
  const offset = (page - 1) * limit;
  const symbol = req.nextUrl.searchParams.get("symbol");

  // Filter parameters (public site supports browse filters only; no survey-response filter)
  const filterSymbol = req.nextUrl.searchParams.get("filterSymbol") || "";
  const filterTitle = req.nextUrl.searchParams.get("filterTitle") || "";
  const filterSearch = req.nextUrl.searchParams.get("filterSearch") || "";
  const filterBodies = req.nextUrl.searchParams.getAll("filterBody");
  const filterYears = req.nextUrl.searchParams.getAll("filterYear").map(y => parseInt(y)).filter(y => !isNaN(y));
  const filterFrequencies = req.nextUrl.searchParams.getAll("filterFrequency");
  const filterSubjects = req.nextUrl.searchParams.getAll("filterSubject");
  const filterEntities = req.nextUrl.searchParams.getAll("filterEntity");
  const filterReportTypes = req.nextUrl.searchParams.getAll("filterReportType");
  const sortColumn = req.nextUrl.searchParams.get("sortColumn");
  const sortDirectionParam = req.nextUrl.searchParams.get("sortDirection");
  const sortDirection = sortDirectionParam === "desc" ? "DESC" : "ASC";

  const currentYear = new Date().getFullYear();
  const SURVEY_YEARS = Array.from({ length: currentYear - 2023 + 1 }, (_, i) => 2023 + i);

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

  const whereClauses: string[] = [];
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (filterSearch) {
    whereClauses.push(`(r.symbol ILIKE $${paramIndex} OR r.proper_title ILIKE $${paramIndex})`);
    params.push(`%${filterSearch}%`);
    paramIndex++;
  }

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

  const havingClauses: string[] = [];
  const havingParams: (string | number)[] = [];
  let havingParamIndex = paramIndex;

  if (filterEntities.length > 0) {
    havingClauses.push(`(
      (SELECT re.suggested_entities FROM ${DB_SCHEMA}.report_entities_public re WHERE re.proper_title = sub.proper_title) && $${havingParamIndex}::text[]
      OR (SELECT re.confirmed_entities FROM ${DB_SCHEMA}.report_entities_public re WHERE re.proper_title = sub.proper_title) && $${havingParamIndex}::text[]
    )`);
    havingParams.push(filterEntities as unknown as string);
    havingParamIndex++;
  }

  if (filterYears.length > 0) {
    havingClauses.push(`MAX(effective_year) = ANY($${havingParamIndex}::int[])`);
    havingParams.push(filterYears as unknown as string);
    havingParamIndex++;
  }

  const frequencyFilterSQL = filterFrequencies.length > 0
    ? `AND COALESCE(confirmed_frequency, calculated_frequency) = ANY($${havingParamIndex})`
    : "";
  if (filterFrequencies.length > 0) {
    havingParams.push(filterFrequencies as unknown as string);
    havingParamIndex++;
  }

  const whereClause = whereClauses.length > 0 ? whereClauses.join(" AND ") : "TRUE";
  const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : "";

  const sortColumnSQLMap: Record<string, string> = {
    symbol: "symbols[1]",
    title: "proper_title",
    entity: "primary_entity",
    body: "normalized_body",
    year: "latest_year",
    frequency: "COALESCE(confirmed_frequency, calculated_frequency)",
  };
  const sortExpression = sortColumn ? sortColumnSQLMap[sortColumn] : null;
  const orderByClause = sortExpression
    ? `${sortExpression} ${sortDirection} NULLS LAST, proper_title ASC, normalized_body ASC`
    : "latest_year DESC NULLS LAST, proper_title, normalized_body";

  const allParams = [...params, ...havingParams];
  const limitParamIndex = havingParamIndex;

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
          (SELECT re.suggested_entities FROM ${DB_SCHEMA}.report_entities_public re WHERE re.proper_title = sub.proper_title) as suggested_entities,
          (SELECT re.confirmed_entities FROM ${DB_SCHEMA}.report_entities_public re WHERE re.proper_title = sub.proper_title) as confirmed_entities,
          (SELECT re.lead_entities FROM ${DB_SCHEMA}.report_entities_public re WHERE re.proper_title = sub.proper_title) as lead_entities,
          (SELECT re.contributing_entities FROM ${DB_SCHEMA}.report_entities_public re WHERE re.proper_title = sub.proper_title) as contributing_entities,
          (SELECT re.suggestions FROM ${DB_SCHEMA}.report_entities_public re WHERE re.proper_title = sub.proper_title) as suggestions,
          (SELECT re.primary_entity FROM ${DB_SCHEMA}.report_entities_public re WHERE re.proper_title = sub.proper_title) as primary_entity,
          (SELECT COALESCE(re.has_confirmation, false) FROM ${DB_SCHEMA}.report_entities_public re WHERE re.proper_title = sub.proper_title) as has_confirmation,
          (SELECT rf.calculated_frequency FROM ${DB_SCHEMA}.report_frequencies rf
           WHERE rf.proper_title = sub.proper_title
           AND rf.normalized_body = COALESCE(sub.normalized_body, '')) as calculated_frequency,
          (SELECT rf.gap_history FROM ${DB_SCHEMA}.report_frequencies rf
           WHERE rf.proper_title = sub.proper_title
           AND rf.normalized_body = COALESCE(sub.normalized_body, '')) as gap_history,
          (SELECT rfc.frequency FROM ${DB_SCHEMA}.report_frequency_confirmations_public rfc
           WHERE rfc.proper_title = sub.proper_title
           AND rfc.normalized_body = COALESCE(sub.normalized_body, '')) as confirmed_frequency,
          COUNT(*)::int as count,
          MAX(effective_year) as latest_year
        FROM (
          SELECT
            r.proper_title,
            r.symbol,
            r.un_body,
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
      ORDER BY ${orderByClause}
      LIMIT $${limitParamIndex} OFFSET $${limitParamIndex + 1}`,
      [...allParams, limit, offset]
    ),
    query<{ total: number }>(
      `WITH grouped AS (
        SELECT
          sub.proper_title,
          sub.normalized_body,
          (SELECT rf.calculated_frequency FROM ${DB_SCHEMA}.report_frequencies rf
           WHERE rf.proper_title = sub.proper_title
           AND rf.normalized_body = COALESCE(sub.normalized_body, '')) as calculated_frequency,
          (SELECT rfc.frequency FROM ${DB_SCHEMA}.report_frequency_confirmations_public rfc
           WHERE rfc.proper_title = sub.proper_title
           AND rfc.normalized_body = COALESCE(sub.normalized_body, '')) as confirmed_frequency,
          COUNT(*)::int as count,
          MAX(effective_year) as latest_year
        FROM (
          SELECT
            r.proper_title,
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
        GROUP BY sub.proper_title, sub.normalized_body
        ${havingClause}
      )
      SELECT COUNT(*)::int as total FROM grouped
      WHERE 1=1 ${frequencyFilterSQL}`,
      allParams
    ),
    query<{ body: string; count: number }>(
      `SELECT un_body as body, COUNT(*)::int as count
       FROM ${DB_SCHEMA}.latest_versions
       WHERE un_body IS NOT NULL
       GROUP BY un_body ORDER BY count DESC`
    ),
    Promise.resolve([{ years: SURVEY_YEARS }]),
    query<SubjectCount>(
      `SELECT subject, COUNT(*)::int as count
       FROM ${DB_SCHEMA}.latest_versions, unnest(subject_terms) as subject
       GROUP BY subject
       HAVING COUNT(*) > 1
       ORDER BY count DESC, subject`
    ),
    query<{ entity: string; count: number }>(
      `SELECT rs.entity, COUNT(DISTINCT rs.proper_title)::int as count
       FROM ${DB_SCHEMA}.report_entity_suggestions rs
       INNER JOIN ${DB_SCHEMA}.latest_versions lv ON rs.proper_title = lv.proper_title
       GROUP BY rs.entity
       ORDER BY count DESC`
    ),
    query<{ report_type: string; count: number }>(
      `SELECT report_type, COUNT(*)::int as count
       FROM ${DB_SCHEMA}.latest_versions
       WHERE report_type IS NOT NULL
       GROUP BY report_type
       ORDER BY count DESC`
    ),
  ]);

  function parseBodyString(bodyStr: string | null): string | null {
    if (!bodyStr) return null;
    if (bodyStr.startsWith('{') && bodyStr.endsWith('}')) {
      const inner = bodyStr.slice(1, -1);
      const match = inner.match(/^"([^"]+)"|^([^,]+)/);
      if (match) return match[1] || match[2] || null;
    }
    return bodyStr;
  }

  function formatFrequency(freq: string | null): string | null {
    if (!freq) return null;
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

  const filteredReports = reports.map((r) => {
    const allSubjects = new Set<string>();
    r.subject_terms_agg?.forEach((terms) => {
      if (Array.isArray(terms)) {
        terms.forEach((t) => {
          if (typeof t === 'string') allSubjects.add(t);
        });
      }
    });

    const effectiveFrequency = r.confirmed_frequency || r.calculated_frequency;

    // Strip AI-only suggestions: keep dgacm/dri-sourced suggestions, plus
    // entities that are independently in the confirmed lead/contributing arrays.
    const leadSet = new Set((r.lead_entities || []).map(e => e.toLowerCase()));
    const contribSet = new Set((r.contributing_entities || []).map(e => e.toLowerCase()));
    const filteredSuggestions = (r.suggestions || []).filter(s => {
      if (s.source !== 'ai') return true;
      const k = s.entity.toLowerCase();
      return leadSet.has(k) || contribSet.has(k);
    });

    return {
      title: r.proper_title || null,
      symbol: r.symbols[0],
      body: r.normalized_body || parseBodyString(r.bodies[0]),
      reportType: r.report_types?.[0] || 'Other',
      year: r.years[0] || null,
      entity: r.primary_entity || null,
      suggestedEntities: r.suggested_entities || [],
      confirmedEntities: r.confirmed_entities || [],
      leadEntities: r.lead_entities || [],
      contributingEntities: r.contributing_entities || [],
      suggestions: filteredSuggestions,
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
      frequency: formatFrequency(effectiveFrequency),
      calculatedFrequency: formatFrequency(r.calculated_frequency),
      confirmedFrequency: formatFrequency(r.confirmed_frequency),
      gapHistory: r.gap_history || null,
      subjectTerms: Array.from(allSubjects),
    };
  });

  const allFrequencies = ["One-time", "Annual", "Biennial", "Triennial", "Quadrennial", "Quinquennial"];

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
      years: yearsResult[0]?.years || SURVEY_YEARS,
      frequencies: allFrequencies,
      entities: entityCounts.map((e) => ({ value: e.entity, count: e.count })),
      reportTypes: reportTypeCounts.map((t) => ({ value: t.report_type, count: t.count })),
    },
    subjectCounts: subjectCounts.map((s) => ({ subject: s.subject, count: s.count })),
  });
}
