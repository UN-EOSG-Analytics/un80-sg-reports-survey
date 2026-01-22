-- View for latest versions of each report series
-- Run: psql $DATABASE_URL -f sql/latest_versions_view.sql

--------------------------------------------------------------------------------
-- LATEST VERSIONS VIEW
--------------------------------------------------------------------------------

DROP VIEW IF EXISTS sg_reports_survey.latest_versions;

CREATE VIEW sg_reports_survey.latest_versions AS
WITH 
-- Count versions per series
version_counts AS (
  SELECT proper_title, COUNT(*)::int as version_count
  FROM sg_reports_survey.reports
  WHERE proper_title IS NOT NULL
    AND symbol NOT LIKE '%/CORR.%'
    AND symbol NOT LIKE '%/REV.%'
  GROUP BY proper_title
),
-- Rank versions to find latest
ranked AS (
  SELECT 
    r.id, r.symbol, r.proper_title, r.title, r.date_year, r.publication_date,
    r.un_body, r.subject_terms, r.embedding,
    re.entity,
    COALESCE(r.date_year, 
      CASE WHEN r.publication_date ~ '^\d{4}' 
      THEN SUBSTRING(r.publication_date FROM 1 FOR 4)::int END
    ) as effective_year,
    ROW_NUMBER() OVER (
      PARTITION BY r.proper_title 
      ORDER BY 
        COALESCE(r.date_year, 
          CASE WHEN r.publication_date ~ '^\d{4}' 
          THEN SUBSTRING(r.publication_date FROM 1 FOR 4)::int END
        ) DESC NULLS LAST,
        r.publication_date DESC NULLS LAST,
        r.symbol DESC
    ) as rn
  FROM sg_reports_survey.reports r
  LEFT JOIN sg_reports_survey.reporting_entities re ON r.symbol = re.symbol
  WHERE r.proper_title IS NOT NULL
    AND r.symbol NOT LIKE '%/CORR.%'
    AND r.symbol NOT LIKE '%/REV.%'
)
SELECT 
  r.id, r.symbol, r.proper_title, r.title, r.date_year, r.publication_date,
  r.un_body, r.subject_terms, r.embedding, r.entity, r.effective_year,
  vc.version_count
FROM ranked r
JOIN version_counts vc ON r.proper_title = vc.proper_title
WHERE r.rn = 1;

COMMENT ON VIEW sg_reports_survey.latest_versions IS 
  'Latest version of each report series (by proper_title), with version_count';
