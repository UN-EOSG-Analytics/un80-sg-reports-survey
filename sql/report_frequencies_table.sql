-- Pre-computed report frequencies table
-- Created and populated by python/06_calculate_frequencies.py

CREATE TABLE IF NOT EXISTS sg_reports_survey.report_frequencies (
  proper_title TEXT PRIMARY KEY,
  calculated_frequency TEXT NOT NULL,  -- 'annual', 'biennial', 'one-time', etc.
  gap_history INT[],                   -- [1, 1, 2, 1] for debugging/transparency
  year_count INT,                      -- number of distinct publication years
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient joins
CREATE INDEX IF NOT EXISTS idx_report_frequencies_frequency 
  ON sg_reports_survey.report_frequencies(calculated_frequency);

-- Comments for documentation
COMMENT ON TABLE sg_reports_survey.report_frequencies IS 'Pre-computed reporting frequencies using weighted mode algorithm';
COMMENT ON COLUMN sg_reports_survey.report_frequencies.calculated_frequency IS 'Frequency label: annual, biennial, triennial, quadrennial, one-time, etc.';
COMMENT ON COLUMN sg_reports_survey.report_frequencies.gap_history IS 'Array of year gaps between publications (most recent first)';
COMMENT ON COLUMN sg_reports_survey.report_frequencies.year_count IS 'Number of distinct publication years for this report group';
