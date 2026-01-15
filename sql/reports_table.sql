-- Reports table for storing SG Reports data
-- Run: psql $DATABASE_URL -f sql/reports_table.sql

-- Create table for SG Reports with named columns and raw JSON
CREATE TABLE IF NOT EXISTS sg_reports_survey.reports (
  id SERIAL PRIMARY KEY,
  
  -- Core identifiers
  record_number TEXT,
  symbol TEXT NOT NULL,
  symbol_split TEXT[],
  symbol_split_n INTEGER,
  
  -- Session/year info
  session_or_year TEXT,
  date TEXT,
  date_year INTEGER,
  publication_date TEXT,
  
  -- Title fields
  proper_title TEXT,
  title TEXT,
  subtitle TEXT[],
  other_title TEXT,
  uniform_title TEXT,
  
  -- Classification
  resource_type_level2 TEXT[],
  resource_type_level3 TEXT[],
  
  -- Organizational
  corporate_name_level1 TEXT,
  corporate_name_level2 TEXT,
  conference_name TEXT,
  
  -- Subject/Agenda
  subject_terms TEXT[],
  agenda_document_symbol TEXT,
  agenda_item_number TEXT[],
  agenda_item_title TEXT[],
  agenda_subjects TEXT[],
  related_resource_identifier TEXT[],
  
  -- Computed/derived
  is_part BOOLEAN DEFAULT FALSE,
  symbol_without_prefix TEXT,
  symbol_without_prefix_split TEXT[],
  symbol_without_prefix_split_n INTEGER,
  
  -- Notes
  note TEXT,
  
  -- Full text content
  text TEXT,
  
  -- Complete raw JSON dump of the original record
  raw_json JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_symbol UNIQUE (symbol)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_reports_symbol ON sg_reports_survey.reports (symbol);
CREATE INDEX IF NOT EXISTS idx_reports_proper_title ON sg_reports_survey.reports (proper_title);
CREATE INDEX IF NOT EXISTS idx_reports_date_year ON sg_reports_survey.reports (date_year);
CREATE INDEX IF NOT EXISTS idx_reports_resource_type_level3 ON sg_reports_survey.reports USING GIN (resource_type_level3);
CREATE INDEX IF NOT EXISTS idx_reports_subject_terms ON sg_reports_survey.reports USING GIN (subject_terms);
CREATE INDEX IF NOT EXISTS idx_reports_raw_json ON sg_reports_survey.reports USING GIN (raw_json);

-- Full-text search index on text content
CREATE INDEX IF NOT EXISTS idx_reports_text_search ON sg_reports_survey.reports USING GIN (to_tsvector('english', COALESCE(text, '')));
