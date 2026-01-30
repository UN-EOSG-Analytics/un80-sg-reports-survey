-- All views for SG Reports Survey
-- Run: psql $DATABASE_URL -f sql/views.sql

-- Drop in reverse dependency order
DROP VIEW IF EXISTS sg_reports_survey.latest_versions;
DROP VIEW IF EXISTS sg_reports_survey.report_entities;
DROP VIEW IF EXISTS sg_reports_survey.sg_report_mandates;
DROP VIEW IF EXISTS sg_reports_survey.resolutions;
DROP VIEW IF EXISTS sg_reports_survey.sg_reports_stats;
DROP VIEW IF EXISTS sg_reports_survey.sg_reports;

--------------------------------------------------------------------------------
-- SG_REPORTS: Defines what counts as a Secretary-General report
-- Stage 1 filtering: type-based, excludes CORR/REV, credentials, requires proper_title
-- Filtered to 2023 to present for survey focus (historical data accessible via documents table)
--------------------------------------------------------------------------------
CREATE VIEW sg_reports_survey.sg_reports AS
SELECT d.*,
  CASE
    WHEN d.resource_type_level3 @> ARRAY['Secretary-General''s Reports'] THEN 'sg_reports_metadata'
    WHEN (d.resource_type_level2 @> ARRAY['Reports'] 
          OR d.resource_type_level2 @> ARRAY['Letters and Notes Verbales'])
         AND (d.title ILIKE '%Secretary-General%' 
              OR array_to_string(d.subtitle, ' ') ILIKE '%Secretary-General%')
    THEN 'title_filter'
    ELSE 'other'
  END as source,
  -- Report type based on resource_type_level2
  CASE 
    WHEN d.resource_type_level2 @> ARRAY['Reports'] THEN 'Report'
    WHEN d.resource_type_level2 @> ARRAY['Letters and Notes Verbales'] THEN 'Note'
    ELSE 'Other'
  END as report_type
FROM sg_reports_survey.documents d
WHERE (d.resource_type_level3 @> ARRAY['Secretary-General''s Reports']
   OR ((d.resource_type_level2 @> ARRAY['Reports'] 
        OR d.resource_type_level2 @> ARRAY['Letters and Notes Verbales'])
       AND (d.title ILIKE '%Secretary-General%' 
            OR array_to_string(d.subtitle, ' ') ILIKE '%Secretary-General%')))
  -- Require proper_title for grouping
  AND d.proper_title IS NOT NULL
  -- Exclude corrections and revisions
  AND d.symbol NOT LIKE '%/CORR.%'
  AND d.symbol NOT LIKE '%/REV.%'
  -- Exclude credentials reports (subject term is uppercase plural)
  AND NOT (d.subject_terms @> ARRAY['REPRESENTATIVES'' CREDENTIALS'])
  AND NOT (d.proper_title ILIKE '%credential%')
  -- Survey focus years (2023 to present)
  AND COALESCE(d.date_year, 
    CASE WHEN d.publication_date ~ '^\d{4}' 
    THEN SUBSTRING(d.publication_date FROM 1 FOR 4)::int END
  ) >= 2023;

--------------------------------------------------------------------------------
-- RESOLUTIONS: All resolution documents
--------------------------------------------------------------------------------
CREATE VIEW sg_reports_survey.resolutions AS
SELECT d.*
FROM sg_reports_survey.documents d
WHERE d.document_category = 'resolution'
   OR d.symbol LIKE 'A/RES/%'
   OR d.symbol LIKE 'S/RES/%'
   OR d.symbol LIKE 'E/RES/%'
   OR d.symbol LIKE 'A/HRC/RES/%';

--------------------------------------------------------------------------------
-- SG_REPORT_MANDATES: Join SG reports with their mandating resolutions
--------------------------------------------------------------------------------
CREATE VIEW sg_reports_survey.sg_report_mandates AS
SELECT 
  r.id as report_id,
  r.symbol as report_symbol,
  r.proper_title as report_title,
  r.title as report_full_title,
  r.date_year as report_year,
  res_symbol as resolution_symbol,
  res.id as resolution_id,
  res.proper_title as resolution_title,
  res.title as resolution_full_title,
  res.date_year as resolution_year
FROM sg_reports_survey.sg_reports r
CROSS JOIN LATERAL unnest(COALESCE(r.based_on_resolution_symbols, ARRAY[]::text[])) AS res_symbol
LEFT JOIN sg_reports_survey.documents res ON res.symbol = res_symbol;

--------------------------------------------------------------------------------
-- SG_REPORTS_STATS: Counts by source
-- No additional filters needed - sg_reports already handles all filtering
--------------------------------------------------------------------------------
CREATE VIEW sg_reports_survey.sg_reports_stats AS
SELECT source, COUNT(*) as count, COUNT(DISTINCT proper_title) as unique_series
FROM sg_reports_survey.sg_reports
GROUP BY source;

--------------------------------------------------------------------------------
-- REPORT_ENTITIES: Combined view of entity suggestions and confirmations
-- Shows all suggested entities per report series with confirmation status
-- (Must be created before latest_versions which depends on it)
--------------------------------------------------------------------------------
CREATE VIEW sg_reports_survey.report_entities AS
WITH suggestions_agg AS (
  -- Aggregate all suggestions per proper_title
  SELECT 
    proper_title,
    jsonb_agg(
      jsonb_build_object(
        'entity', entity,
        'source', source,
        'confidence_score', confidence_score,
        'match_details', match_details,
        'created_at', created_at
      ) ORDER BY 
        -- Prioritize: higher confidence, then dgacm > dri > ai
        confidence_score DESC NULLS LAST,
        CASE source WHEN 'dgacm' THEN 1 WHEN 'dri' THEN 2 WHEN 'ai' THEN 3 END
    ) as suggestions,
    array_agg(DISTINCT entity ORDER BY entity) as suggested_entities
  FROM sg_reports_survey.report_entity_suggestions
  GROUP BY proper_title
),
confirmations_agg AS (
  -- Aggregate all confirmations per proper_title
  SELECT 
    c.proper_title,
    jsonb_agg(
      jsonb_build_object(
        'entity', c.entity,
        'confirmed_by_user_id', c.confirmed_by_user_id,
        'confirmed_by_email', u.email,
        'confirmed_at', c.confirmed_at,
        'notes', c.notes
      ) ORDER BY c.confirmed_at DESC
    ) as confirmations,
    array_agg(DISTINCT c.entity ORDER BY c.entity) as confirmed_entities
  FROM sg_reports_survey.report_entity_confirmations c
  LEFT JOIN sg_reports_survey.users u ON c.confirmed_by_user_id = u.id
  GROUP BY c.proper_title
)
SELECT 
  COALESCE(s.proper_title, c.proper_title) as proper_title,
  s.suggestions,
  s.suggested_entities,
  c.confirmations,
  c.confirmed_entities,
  -- Primary entity: first confirmed, otherwise highest-confidence suggestion
  COALESCE(
    c.confirmed_entities[1],
    s.suggested_entities[1]
  ) as primary_entity,
  -- Has any confirmation?
  (c.proper_title IS NOT NULL) as has_confirmation
FROM suggestions_agg s
FULL OUTER JOIN confirmations_agg c ON s.proper_title = c.proper_title;

COMMENT ON VIEW sg_reports_survey.report_entities IS 'Combined view of entity suggestions and confirmations per report series';

--------------------------------------------------------------------------------
-- LATEST_VERSIONS: Most recent version of each report series
-- Stage 2 deduplication: picks latest version per (proper_title, normalized_body)
-- Reports are now separated by body (GA vs ECOSOC, etc.)
-- Year filtering inherited from sg_reports view (2023 to present)
--------------------------------------------------------------------------------
CREATE VIEW sg_reports_survey.latest_versions AS
WITH normalized AS (
  -- Normalize body to extract first value from PostgreSQL array format
  SELECT r.*,
         CASE 
           WHEN r.un_body LIKE '{%}' THEN 
             COALESCE(
               SUBSTRING(r.un_body FROM '^\{"?([^",}]+)"?'),
               r.un_body
             )
           ELSE r.un_body
         END as normalized_body,
         COALESCE(r.date_year, 
           CASE WHEN r.publication_date ~ '^\d{4}' 
           THEN SUBSTRING(r.publication_date FROM 1 FOR 4)::int END
         ) as effective_year
  FROM sg_reports_survey.sg_reports r
),
version_counts AS (
  -- Count versions per (proper_title, normalized_body) group
  SELECT proper_title, normalized_body, COUNT(*)::int as version_count
  FROM normalized
  GROUP BY proper_title, normalized_body
),
ranked AS (
  SELECT r.id, r.symbol, r.proper_title, r.title, r.date_year, r.publication_date,
         r.un_body, r.normalized_body, r.subject_terms, r.source, r.report_type, 
         r.based_on_resolution_symbols, r.effective_year,
         ROW_NUMBER() OVER (
           PARTITION BY r.proper_title, r.normalized_body
           ORDER BY r.effective_year DESC NULLS LAST,
             r.publication_date DESC NULLS LAST, r.symbol DESC
         ) as rn
  FROM normalized r
)
SELECT r.id, r.symbol, r.proper_title, r.title, r.date_year, r.publication_date,
       r.un_body, r.normalized_body, r.subject_terms, r.effective_year, r.source, r.report_type,
       r.based_on_resolution_symbols, vc.version_count,
       d.embedding,
       re.primary_entity as entity
FROM ranked r
JOIN version_counts vc ON r.proper_title = vc.proper_title 
  AND COALESCE(r.normalized_body, '') = COALESCE(vc.normalized_body, '')
JOIN sg_reports_survey.documents d ON r.id = d.id
LEFT JOIN sg_reports_survey.report_entities re ON r.proper_title = re.proper_title
WHERE r.rn = 1;

\echo 'Views created. Stats:'
SELECT * FROM sg_reports_survey.sg_reports_stats;
