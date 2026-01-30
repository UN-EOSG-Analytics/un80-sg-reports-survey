-- Documents and entity tables for SG Reports Survey
-- Run: psql $DATABASE_URL -f sql/reports_tables.sql
--
-- AZURE SETUP: pg_vector extension must be enabled on your Azure PostgreSQL Flexible Server
-- In Azure Portal: Server parameters -> Search "azure.extensions" -> Add "vector"

CREATE EXTENSION IF NOT EXISTS vector;

--------------------------------------------------------------------------------
-- DOCUMENTS TABLE
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sg_reports_survey.documents (
  id SERIAL PRIMARY KEY,
  
  -- Core identifiers
  record_number TEXT,
  symbol TEXT NOT NULL,
  symbol_split TEXT[],
  symbol_split_n INTEGER,
  
  -- Document categorization
  document_category TEXT,  -- 'report', 'resolution', 'letter', etc.
  
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
  un_body TEXT,
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
  
  -- Mandate/basis information (for reports: which resolutions they're based on)
  based_on_resolution_symbols TEXT[],
  
  -- Full text content
  text TEXT,
  word_count INTEGER,
  
  -- Vector embedding (1024 dimensions for text-embedding-3-large)
  embedding vector(1024),
  
  -- Complete raw JSON dump of the original record
  raw_json JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_document_symbol UNIQUE (symbol)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_documents_symbol ON sg_reports_survey.documents (symbol);
CREATE INDEX IF NOT EXISTS idx_documents_document_category ON sg_reports_survey.documents (document_category);
CREATE INDEX IF NOT EXISTS idx_documents_proper_title ON sg_reports_survey.documents (proper_title);
CREATE INDEX IF NOT EXISTS idx_documents_date_year ON sg_reports_survey.documents (date_year);
CREATE INDEX IF NOT EXISTS idx_documents_resource_type_level3 ON sg_reports_survey.documents USING GIN (resource_type_level3);
CREATE INDEX IF NOT EXISTS idx_documents_subject_terms ON sg_reports_survey.documents USING GIN (subject_terms);
CREATE INDEX IF NOT EXISTS idx_documents_based_on_resolution_symbols ON sg_reports_survey.documents USING GIN (based_on_resolution_symbols);
CREATE INDEX IF NOT EXISTS idx_documents_raw_json ON sg_reports_survey.documents USING GIN (raw_json);
CREATE INDEX IF NOT EXISTS idx_documents_text_search ON sg_reports_survey.documents USING GIN (to_tsvector('english', COALESCE(text, '')));
CREATE INDEX IF NOT EXISTS idx_documents_embedding ON sg_reports_survey.documents USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

--------------------------------------------------------------------------------
-- REPORT ENTITY SUGGESTIONS
-- Multiple entity suggestions per report series from different sources
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sg_reports_survey.report_entity_suggestions (
  id SERIAL PRIMARY KEY,
  proper_title TEXT NOT NULL,
  entity TEXT NOT NULL REFERENCES systemchart.entities(entity),
  source TEXT NOT NULL CHECK (source IN ('dgacm', 'dri', 'ai')),
  confidence_score NUMERIC(4,3) CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  match_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_suggestion_per_source UNIQUE (proper_title, entity, source)
);

CREATE INDEX IF NOT EXISTS idx_suggestions_proper_title ON sg_reports_survey.report_entity_suggestions (proper_title);
CREATE INDEX IF NOT EXISTS idx_suggestions_entity ON sg_reports_survey.report_entity_suggestions (entity);
CREATE INDEX IF NOT EXISTS idx_suggestions_source ON sg_reports_survey.report_entity_suggestions (source);

--------------------------------------------------------------------------------
-- REPORT ENTITY CONFIRMATIONS
-- User confirmations that a report belongs to their entity
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sg_reports_survey.report_entity_confirmations (
  id SERIAL PRIMARY KEY,
  proper_title TEXT NOT NULL,
  entity TEXT NOT NULL REFERENCES systemchart.entities(entity),
  role TEXT NOT NULL DEFAULT 'lead' CHECK (role IN ('lead', 'contributing')),
  confirmed_by_user_id UUID NOT NULL REFERENCES sg_reports_survey.users(id),
  confirmed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  
  CONSTRAINT unique_confirmation_per_entity UNIQUE (proper_title, entity)
);

CREATE INDEX IF NOT EXISTS idx_confirmations_proper_title ON sg_reports_survey.report_entity_confirmations (proper_title);
CREATE INDEX IF NOT EXISTS idx_confirmations_entity ON sg_reports_survey.report_entity_confirmations (entity);
CREATE INDEX IF NOT EXISTS idx_confirmations_user ON sg_reports_survey.report_entity_confirmations (confirmed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_confirmations_role ON sg_reports_survey.report_entity_confirmations (proper_title, role);
