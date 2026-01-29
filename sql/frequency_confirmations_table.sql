-- User frequency confirmations table
-- Stores user-confirmed frequencies for reports

CREATE TABLE IF NOT EXISTS sg_reports_survey.report_frequency_confirmations (
  id SERIAL PRIMARY KEY,
  proper_title TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('annual', 'biennial', 'triennial', 'quadrennial', 'quinquennial', 'one-time', 'other')),
  confirmed_by_user_id UUID NOT NULL REFERENCES sg_reports_survey.users(id),
  confirmed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  
  -- Only one confirmed frequency per report (anyone can update)
  UNIQUE (proper_title)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_freq_confirmations_frequency 
  ON sg_reports_survey.report_frequency_confirmations(frequency);
CREATE INDEX IF NOT EXISTS idx_freq_confirmations_user 
  ON sg_reports_survey.report_frequency_confirmations(confirmed_by_user_id);

-- Comments for documentation
COMMENT ON TABLE sg_reports_survey.report_frequency_confirmations IS 'User-confirmed reporting frequencies - one per report, latest confirmation wins';
COMMENT ON COLUMN sg_reports_survey.report_frequency_confirmations.frequency IS 'User-confirmed frequency for this report';
COMMENT ON COLUMN sg_reports_survey.report_frequency_confirmations.notes IS 'Optional notes explaining the frequency determination';
