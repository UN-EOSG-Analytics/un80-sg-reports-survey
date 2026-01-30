-- Migration: Add normalized_body to frequency tables and update views
-- This separates reports by UN body (GA, ECOSOC, etc.) for proper analysis
-- Run: psql $DATABASE_URL -f sql/migrations/002_add_normalized_body.sql

BEGIN;

-- 1. Recreate report_frequencies table with normalized_body
DROP TABLE IF EXISTS sg_reports_survey.report_frequencies CASCADE;

CREATE TABLE sg_reports_survey.report_frequencies (
  proper_title TEXT NOT NULL,
  normalized_body TEXT NOT NULL DEFAULT '',  -- Empty string for unknown body
  calculated_frequency TEXT NOT NULL,
  gap_history INT[],
  year_count INT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (proper_title, normalized_body)
);

CREATE INDEX idx_report_frequencies_frequency 
  ON sg_reports_survey.report_frequencies(calculated_frequency);
CREATE INDEX idx_report_frequencies_body
  ON sg_reports_survey.report_frequencies(normalized_body);

COMMENT ON TABLE sg_reports_survey.report_frequencies IS 'Pre-computed reporting frequencies using weighted mode algorithm, grouped by title and UN body';
COMMENT ON COLUMN sg_reports_survey.report_frequencies.proper_title IS 'Report title for grouping';
COMMENT ON COLUMN sg_reports_survey.report_frequencies.normalized_body IS 'Normalized UN body extracted from un_body field (empty string if unknown)';
COMMENT ON COLUMN sg_reports_survey.report_frequencies.calculated_frequency IS 'Frequency label: annual, biennial, triennial, quadrennial, one-time, etc.';
COMMENT ON COLUMN sg_reports_survey.report_frequencies.gap_history IS 'Array of year gaps between publications (most recent first)';
COMMENT ON COLUMN sg_reports_survey.report_frequencies.year_count IS 'Number of distinct publication years for this report group';

-- 2. Recreate report_frequency_confirmations table with normalized_body
DROP TABLE IF EXISTS sg_reports_survey.report_frequency_confirmations CASCADE;

CREATE TABLE sg_reports_survey.report_frequency_confirmations (
  id SERIAL PRIMARY KEY,
  proper_title TEXT NOT NULL,
  normalized_body TEXT NOT NULL DEFAULT '',  -- Empty string for unknown body
  frequency TEXT NOT NULL CHECK (frequency IN ('multiple-per-year', 'annual', 'biennial', 'triennial', 'quadrennial', 'quinquennial', 'one-time', 'other')),
  confirmed_by_user_id UUID NOT NULL REFERENCES sg_reports_survey.users(id),
  confirmed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  UNIQUE (proper_title, normalized_body)
);

CREATE INDEX IF NOT EXISTS idx_freq_confirmations_frequency 
  ON sg_reports_survey.report_frequency_confirmations(frequency);
CREATE INDEX IF NOT EXISTS idx_freq_confirmations_user 
  ON sg_reports_survey.report_frequency_confirmations(confirmed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_freq_confirmations_body
  ON sg_reports_survey.report_frequency_confirmations(normalized_body);

COMMENT ON TABLE sg_reports_survey.report_frequency_confirmations IS 'User-confirmed reporting frequencies - one per (report, body), latest confirmation wins';
COMMENT ON COLUMN sg_reports_survey.report_frequency_confirmations.proper_title IS 'Report title for grouping';
COMMENT ON COLUMN sg_reports_survey.report_frequency_confirmations.normalized_body IS 'Normalized UN body extracted from un_body field';
COMMENT ON COLUMN sg_reports_survey.report_frequency_confirmations.frequency IS 'User-confirmed frequency for this report';
COMMENT ON COLUMN sg_reports_survey.report_frequency_confirmations.notes IS 'Optional notes explaining the frequency determination';

-- 3. Recreate views to use normalized_body grouping
-- Drop in reverse dependency order
DROP VIEW IF EXISTS sg_reports_survey.latest_versions;

-- Recreate latest_versions with body-based grouping
CREATE VIEW sg_reports_survey.latest_versions AS
WITH normalized AS (
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

COMMIT;

-- After running this migration, you must run the Python script to recalculate frequencies:
-- cd python && python 06_calculate_frequencies.py
\echo 'Migration complete. Run: cd python && python 06_calculate_frequencies.py to recalculate frequencies'
