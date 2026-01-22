-- All views for SG Reports Survey
-- Run: psql $DATABASE_URL -f sql/views.sql

DROP VIEW IF EXISTS sg_reports_survey.latest_versions;
DROP VIEW IF EXISTS sg_reports_survey.sg_reports_stats;
DROP VIEW IF EXISTS sg_reports_survey.sg_reports;

--------------------------------------------------------------------------------
-- SG_REPORTS: Defines what counts as a Secretary-General report
--------------------------------------------------------------------------------
CREATE VIEW sg_reports_survey.sg_reports AS
SELECT r.*,
  CASE
    WHEN r.resource_type_level3 @> ARRAY['Secretary-General''s Reports'] THEN 'sg_reports_metadata'
    WHEN (r.resource_type_level2 @> ARRAY['Reports'] 
          OR r.resource_type_level2 @> ARRAY['Letters and Notes Verbales'])
         AND (r.title ILIKE '%Secretary-General%' 
              OR array_to_string(r.subtitle, ' ') ILIKE '%Secretary-General%')
    THEN 'title_filter'
    ELSE 'other'
  END as source
FROM sg_reports_survey.reports r
WHERE r.resource_type_level3 @> ARRAY['Secretary-General''s Reports']
   OR ((r.resource_type_level2 @> ARRAY['Reports'] 
        OR r.resource_type_level2 @> ARRAY['Letters and Notes Verbales'])
       AND (r.title ILIKE '%Secretary-General%' 
            OR array_to_string(r.subtitle, ' ') ILIKE '%Secretary-General%'));

--------------------------------------------------------------------------------
-- SG_REPORTS_STATS: Counts by source
--------------------------------------------------------------------------------
CREATE VIEW sg_reports_survey.sg_reports_stats AS
SELECT source, COUNT(*) as count, COUNT(DISTINCT proper_title) as unique_series
FROM sg_reports_survey.sg_reports
WHERE proper_title IS NOT NULL
  AND symbol NOT LIKE '%/CORR.%'
  AND symbol NOT LIKE '%/REV.%'
GROUP BY source;

--------------------------------------------------------------------------------
-- LATEST_VERSIONS: Most recent version of each report series
--------------------------------------------------------------------------------
CREATE VIEW sg_reports_survey.latest_versions AS
WITH version_counts AS (
  SELECT proper_title, COUNT(*)::int as version_count
  FROM sg_reports_survey.sg_reports
  WHERE proper_title IS NOT NULL
    AND symbol NOT LIKE '%/CORR.%' AND symbol NOT LIKE '%/REV.%'
  GROUP BY proper_title
),
ranked AS (
  SELECT r.id, r.symbol, r.proper_title, r.title, r.date_year, r.publication_date,
         r.un_body, r.subject_terms, r.source,
         COALESCE(r.date_year, 
           CASE WHEN r.publication_date ~ '^\d{4}' 
           THEN SUBSTRING(r.publication_date FROM 1 FOR 4)::int END
         ) as effective_year,
         ROW_NUMBER() OVER (
           PARTITION BY r.proper_title 
           ORDER BY COALESCE(r.date_year, 
             CASE WHEN r.publication_date ~ '^\d{4}' 
             THEN SUBSTRING(r.publication_date FROM 1 FOR 4)::int END) DESC NULLS LAST,
             r.publication_date DESC NULLS LAST, r.symbol DESC
         ) as rn
  FROM sg_reports_survey.sg_reports r
  WHERE r.proper_title IS NOT NULL
    AND r.symbol NOT LIKE '%/CORR.%' AND r.symbol NOT LIKE '%/REV.%'
)
SELECT r.id, r.symbol, r.proper_title, r.title, r.date_year, r.publication_date,
       r.un_body, r.subject_terms, r.effective_year, r.source, vc.version_count
FROM ranked r
JOIN version_counts vc ON r.proper_title = vc.proper_title
WHERE r.rn = 1;

\echo 'Views created. Stats:'
SELECT * FROM sg_reports_survey.sg_reports_stats;
