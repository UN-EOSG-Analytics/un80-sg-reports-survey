-- Migration: Add support for manual report entries
-- Run: psql $DATABASE_URL -f sql/manual_reports_migration.sql

-- Track where documents originated (library import vs manual entry)
ALTER TABLE sg_reports_survey.documents 
ADD COLUMN IF NOT EXISTS data_source TEXT NOT NULL DEFAULT 'library' 
CHECK (data_source IN ('library', 'manual'));

-- Track who created manual entries
ALTER TABLE sg_reports_survey.documents
ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES sg_reports_survey.users(id);

-- Index for filtering by data source
CREATE INDEX IF NOT EXISTS idx_documents_data_source ON sg_reports_survey.documents (data_source);

-- Update sg_reports view to include manual entries
-- Must drop dependent views first
DROP VIEW IF EXISTS sg_reports_survey.latest_versions;
DROP VIEW IF EXISTS sg_reports_survey.sg_report_mandates;
DROP VIEW IF EXISTS sg_reports_survey.sg_reports_stats;
DROP VIEW IF EXISTS sg_reports_survey.sg_reports;

CREATE VIEW sg_reports_survey.sg_reports AS
SELECT d.*,
  CASE
    WHEN d.data_source = 'manual' THEN 'manual'
    WHEN d.resource_type_level3 @> ARRAY['Secretary-General''s Reports'] THEN 'sg_reports_metadata'
    WHEN (d.resource_type_level2 @> ARRAY['Reports'] 
          OR d.resource_type_level2 @> ARRAY['Letters and Notes Verbales'])
         AND (d.title ILIKE '%Secretary-General%' 
              OR array_to_string(d.subtitle, ' ') ILIKE '%Secretary-General%')
    THEN 'title_filter'
    ELSE 'other'
  END as source,
  CASE 
    WHEN d.resource_type_level2 @> ARRAY['Reports'] THEN 'Report'
    WHEN d.resource_type_level2 @> ARRAY['Letters and Notes Verbales'] THEN 'Note'
    ELSE 'Other'
  END as report_type
FROM sg_reports_survey.documents d
WHERE (
    d.data_source = 'manual'
    OR d.resource_type_level3 @> ARRAY['Secretary-General''s Reports']
    OR ((d.resource_type_level2 @> ARRAY['Reports'] 
         OR d.resource_type_level2 @> ARRAY['Letters and Notes Verbales'])
        AND (d.title ILIKE '%Secretary-General%' 
             OR array_to_string(d.subtitle, ' ') ILIKE '%Secretary-General%'))
  )
  AND d.proper_title IS NOT NULL
  AND d.symbol NOT LIKE '%/CORR.%'
  AND d.symbol NOT LIKE '%/REV.%'
  AND NOT COALESCE(d.subject_terms @> ARRAY['REPRESENTATIVES'' CREDENTIALS'], false)
  AND NOT (d.proper_title ILIKE '%credential%')
  AND COALESCE(d.date_year, 
    CASE WHEN d.publication_date ~ '^\d{4}' 
    THEN SUBSTRING(d.publication_date FROM 1 FOR 4)::int END
  ) >= 2023;

-- Recreate dependent views (copy from views.sql)
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

CREATE VIEW sg_reports_survey.sg_reports_stats AS
SELECT source, COUNT(*) as count, COUNT(DISTINCT proper_title) as unique_series
FROM sg_reports_survey.sg_reports
GROUP BY source;

-- Recreate latest_versions (needs report_entities which should still exist)
CREATE VIEW sg_reports_survey.latest_versions AS
WITH ranked AS (
  SELECT 
    r.*,
    CASE 
      WHEN r.symbol LIKE 'A/%' THEN 'General Assembly'
      WHEN r.symbol LIKE 'S/%' THEN 'Security Council'
      WHEN r.symbol LIKE 'E/%' THEN 'Economic and Social Council'
      WHEN r.symbol LIKE 'A/HRC/%' THEN 'Human Rights Council'
      ELSE COALESCE(r.un_body, 'Other')
    END as normalized_body,
    COALESCE(r.date_year, 
      CASE WHEN r.publication_date ~ '^\d{4}' 
      THEN SUBSTRING(r.publication_date FROM 1 FOR 4)::int END
    ) as effective_year,
    ROW_NUMBER() OVER (
      PARTITION BY r.proper_title, 
        CASE 
          WHEN r.symbol LIKE 'A/%' THEN 'General Assembly'
          WHEN r.symbol LIKE 'S/%' THEN 'Security Council'
          WHEN r.symbol LIKE 'E/%' THEN 'Economic and Social Council'
          WHEN r.symbol LIKE 'A/HRC/%' THEN 'Human Rights Council'
          ELSE COALESCE(r.un_body, 'Other')
        END
      ORDER BY r.date_year DESC NULLS LAST, r.publication_date DESC NULLS LAST
    ) as rn,
    COUNT(*) OVER (
      PARTITION BY r.proper_title,
        CASE 
          WHEN r.symbol LIKE 'A/%' THEN 'General Assembly'
          WHEN r.symbol LIKE 'S/%' THEN 'Security Council'
          WHEN r.symbol LIKE 'E/%' THEN 'Economic and Social Council'
          WHEN r.symbol LIKE 'A/HRC/%' THEN 'Human Rights Council'
          ELSE COALESCE(r.un_body, 'Other')
        END
    ) as version_count
  FROM sg_reports_survey.sg_reports r
)
SELECT 
  ranked.*,
  re.primary_entity as entity
FROM ranked
LEFT JOIN sg_reports_survey.report_entities re ON ranked.proper_title = re.proper_title
WHERE rn = 1;
