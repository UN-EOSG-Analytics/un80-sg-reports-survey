-- Survey responses table
-- Stores entity recommendations for each report group (one per entity per report)

-- Drop existing table if needed (comment out in production)
-- DROP TABLE IF EXISTS sg_reports_survey.survey_responses;

CREATE TABLE IF NOT EXISTS sg_reports_survey.survey_responses (
  id SERIAL PRIMARY KEY,
  
  -- Report identification (using proper_title as group key)
  proper_title TEXT NOT NULL,
  latest_symbol TEXT NOT NULL,  -- Most recent symbol for reference
  
  -- Entity making the response (one response per entity per report)
  user_entity TEXT NOT NULL,
  
  -- Audit fields (stored for internal audit, never displayed to users)
  created_by_email TEXT NOT NULL,  -- Who originally created
  updated_by_email TEXT NOT NULL,  -- Who last modified
  
  -- Core recommendation
  status TEXT NOT NULL CHECK (status IN ('continue', 'merge', 'discontinue')),
  
  -- Continue options
  frequency TEXT CHECK (frequency IS NULL OR frequency IN ('multiple-per-year', 'annual', 'biennial', 'triennial', 'quadrennial', 'one-time')),
  format TEXT CHECK (format IS NULL OR format IN ('shorter', 'oral', 'dashboard', 'other', 'no-change')),
  format_other TEXT,  -- When format = 'other'
  
  -- Merge options
  merge_targets TEXT[],  -- Array of symbols to merge with
  
  -- Discontinue options
  discontinue_reason TEXT,
  
  -- General
  comments TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One response per entity per report group
  UNIQUE (proper_title, user_entity)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_responses_proper_title ON sg_reports_survey.survey_responses(proper_title);
CREATE INDEX IF NOT EXISTS idx_responses_user_entity ON sg_reports_survey.survey_responses(user_entity);
CREATE INDEX IF NOT EXISTS idx_responses_status ON sg_reports_survey.survey_responses(status);
CREATE INDEX IF NOT EXISTS idx_responses_created_at ON sg_reports_survey.survey_responses(created_at DESC);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION sg_reports_survey.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on UPDATE
DROP TRIGGER IF EXISTS update_survey_responses_updated_at ON sg_reports_survey.survey_responses;
CREATE TRIGGER update_survey_responses_updated_at
  BEFORE UPDATE ON sg_reports_survey.survey_responses
  FOR EACH ROW
  EXECUTE FUNCTION sg_reports_survey.update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE sg_reports_survey.survey_responses IS 'Entity survey responses for SG report recommendations (one per entity per report)';
COMMENT ON COLUMN sg_reports_survey.survey_responses.proper_title IS 'Report group identifier - all versions share this';
COMMENT ON COLUMN sg_reports_survey.survey_responses.latest_symbol IS 'Most recent document symbol for this report group';
COMMENT ON COLUMN sg_reports_survey.survey_responses.user_entity IS 'Entity making the recommendation (unique per report)';
COMMENT ON COLUMN sg_reports_survey.survey_responses.created_by_email IS 'Email of user who created this response (audit only, not displayed)';
COMMENT ON COLUMN sg_reports_survey.survey_responses.updated_by_email IS 'Email of user who last modified this response (audit only, not displayed)';
COMMENT ON COLUMN sg_reports_survey.survey_responses.status IS 'Recommendation: continue, merge, or discontinue';
COMMENT ON COLUMN sg_reports_survey.survey_responses.merge_targets IS 'Array of symbols to merge with (when status=merge)';
COMMENT ON COLUMN sg_reports_survey.survey_responses.frequency IS 'Recommended frequency (when status=continue)';
COMMENT ON COLUMN sg_reports_survey.survey_responses.format IS 'Recommended format (when status=continue)';
