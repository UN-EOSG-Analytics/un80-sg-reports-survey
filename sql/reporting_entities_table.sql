-- Reporting entities table - maps symbols to entities from manual_list and DRI
-- Run: psql $DATABASE_URL -f sql/reporting_entities_table.sql

-- Create table for reporting entities lookup
CREATE TABLE IF NOT EXISTS sg_reports_survey.reporting_entities (
  id SERIAL PRIMARY KEY,
  
  -- Symbol is the key for joining with reports table
  symbol TEXT NOT NULL,
  
  -- Entity from manual_list.xlsx (higher priority source)
  entity_manual TEXT,
  
  -- Entity from dri.xlsx (fallback source)
  entity_dri TEXT,
  
  -- Computed/derived: preferred entity (manual first, then dri)
  entity TEXT GENERATED ALWAYS AS (COALESCE(entity_manual, entity_dri)) STORED,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_reporting_entity_symbol UNIQUE (symbol)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reporting_entities_symbol ON sg_reports_survey.reporting_entities (symbol);
CREATE INDEX IF NOT EXISTS idx_reporting_entities_entity ON sg_reports_survey.reporting_entities (entity);
CREATE INDEX IF NOT EXISTS idx_reporting_entities_entity_manual ON sg_reports_survey.reporting_entities (entity_manual);
CREATE INDEX IF NOT EXISTS idx_reporting_entities_entity_dri ON sg_reports_survey.reporting_entities (entity_dri);

-- Comment
COMMENT ON TABLE sg_reports_survey.reporting_entities IS 'Maps document symbols to reporting entities from manual_list.xlsx and dri.xlsx';
COMMENT ON COLUMN sg_reports_survey.reporting_entities.entity_manual IS 'Lead entity from manual_list.xlsx (preferred source)';
COMMENT ON COLUMN sg_reports_survey.reporting_entities.entity_dri IS 'Entity from dri.xlsx (fallback source)';
COMMENT ON COLUMN sg_reports_survey.reporting_entities.entity IS 'Computed preferred entity: manual first, then dri';
