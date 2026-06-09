-- User frequency confirmations table (safe version - no DROP TABLE)
-- Use this file for fresh installs. For existing databases, use the migration:
--   sql/migrations/002_add_normalized_body.sql
--
-- NOTE: The original frequency_confirmations_table.sql contains a DROP TABLE
-- which is destructive in production and should not be run on a live database.
-- This file uses CREATE TABLE IF NOT EXISTS instead.

CREATE TABLE IF NOT EXISTS sg_reports_survey.report_frequency_confirmations (
  id SERIAL PRIMARY KEY,
  proper_title TEXT NOT NULL,
  normalized_body TEXT NOT NULL DEFAULT '',  -- Normalized UN body (empty string if unknown)
  frequency TEXT NOT NULL CHECK (frequency IN ('multiple-per-year', 'annual', 'biennial', 'triennial', 'quadrennial', 'quinquennial', 'one-time', 'other')),
  confirmed_by_user_id UUID NOT NULL REFERENCES sg_reports_survey.users(id),
  confirmed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  UNIQUE (proper_title, normalized_body)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_freq_confirmations_frequency
  ON sg_reports_survey.report_frequency_confirmations(frequency);
CREATE INDEX IF NOT EXISTS idx_freq_confirmations_user
  ON sg_reports_survey.report_frequency_confirmations(confirmed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_freq_confirmations_body
  ON sg_reports_survey.report_frequency_confirmations(normalized_body);

-- Comments for documentation
COMMENT ON TABLE sg_reports_survey.report_frequency_confirmations IS 'User-confirmed reporting frequencies - one per (report, body), latest confirmation wins';
COMMENT ON COLUMN sg_reports_survey.report_frequency_confirmations.proper_title IS 'Report title for grouping';
COMMENT ON COLUMN sg_reports_survey.report_frequency_confirmations.normalized_body IS 'Normalized UN body extracted from un_body field (empty string if unknown)';
COMMENT ON COLUMN sg_reports_survey.report_frequency_confirmations.frequency IS 'User-confirmed frequency for this report';
COMMENT ON COLUMN sg_reports_survey.report_frequency_confirmations.notes IS 'Optional notes explaining the frequency determination';
