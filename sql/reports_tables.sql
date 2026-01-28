-- Documents and reporting entities tables for SG Reports Survey
-- Run: psql $DATABASE_URL -f sql/reports_tables.sql
--
-- AZURE SETUP: pg_vector extension must be enabled on your Azure PostgreSQL Flexible Server
-- In Azure Portal: Go to your PostgreSQL server -> Server parameters -> Search "azure.extensions"
-- Add "vector" to the list of allowed extensions, then save and restart if needed.

-- Enable the vector extension (requires azure.extensions to include 'vector')
CREATE EXTENSION IF NOT EXISTS vector;

--------------------------------------------------------------------------------
-- DOCUMENTS TABLE (formerly 'reports' - now holds reports, resolutions, etc.)
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
  
  -- Vector embedding for semantic similarity search (1024 dimensions for text-embedding-3-large)
  -- NULL for resolutions (we skip vector generation for them)
  embedding vector(1024),
  
  -- Complete raw JSON dump of the original record
  raw_json JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_document_symbol UNIQUE (symbol)
);

-- Indexes for documents table
CREATE INDEX IF NOT EXISTS idx_documents_symbol ON sg_reports_survey.documents (symbol);
CREATE INDEX IF NOT EXISTS idx_documents_document_category ON sg_reports_survey.documents (document_category);
CREATE INDEX IF NOT EXISTS idx_documents_proper_title ON sg_reports_survey.documents (proper_title);
CREATE INDEX IF NOT EXISTS idx_documents_date_year ON sg_reports_survey.documents (date_year);
CREATE INDEX IF NOT EXISTS idx_documents_resource_type_level3 ON sg_reports_survey.documents USING GIN (resource_type_level3);
CREATE INDEX IF NOT EXISTS idx_documents_subject_terms ON sg_reports_survey.documents USING GIN (subject_terms);
CREATE INDEX IF NOT EXISTS idx_documents_based_on_resolution_symbols ON sg_reports_survey.documents USING GIN (based_on_resolution_symbols);
CREATE INDEX IF NOT EXISTS idx_documents_raw_json ON sg_reports_survey.documents USING GIN (raw_json);

-- Full-text search index on text content
CREATE INDEX IF NOT EXISTS idx_documents_text_search ON sg_reports_survey.documents USING GIN (to_tsvector('english', COALESCE(text, '')));

-- Vector similarity search index using HNSW (Hierarchical Navigable Small World)
CREATE INDEX IF NOT EXISTS idx_documents_embedding 
ON sg_reports_survey.documents 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Comments
COMMENT ON TABLE sg_reports_survey.documents IS 'Holds all UN documents: reports, resolutions, letters, etc.';
COMMENT ON COLUMN sg_reports_survey.documents.document_category IS 'High-level category: report, resolution, letter, etc.';
COMMENT ON COLUMN sg_reports_survey.documents.based_on_resolution_symbols IS 'For reports: array of resolution symbols this report is based on (e.g., A/RES/78/70)';
COMMENT ON COLUMN sg_reports_survey.documents.embedding IS 'Vector embedding from text-embedding-3-large (1024 dimensions) for semantic similarity search';

--------------------------------------------------------------------------------
-- BACKWARDS COMPATIBILITY: Create 'reports' as a view pointing to documents
--------------------------------------------------------------------------------
CREATE OR REPLACE VIEW sg_reports_survey.reports AS
SELECT * FROM sg_reports_survey.documents
WHERE document_category IN ('report', 'letter') OR document_category IS NULL;

--------------------------------------------------------------------------------
-- REPORTING ENTITIES TABLE (DEPRECATED - use report_entity_suggestions instead)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sg_reports_survey.reporting_entities (
  id SERIAL PRIMARY KEY,
  
  -- Symbol is the key for joining with documents table
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

-- Indexes for reporting entities table
CREATE INDEX IF NOT EXISTS idx_reporting_entities_symbol ON sg_reports_survey.reporting_entities (symbol);
CREATE INDEX IF NOT EXISTS idx_reporting_entities_entity ON sg_reports_survey.reporting_entities (entity);
CREATE INDEX IF NOT EXISTS idx_reporting_entities_entity_manual ON sg_reports_survey.reporting_entities (entity_manual);
CREATE INDEX IF NOT EXISTS idx_reporting_entities_entity_dri ON sg_reports_survey.reporting_entities (entity_dri);

-- Comments
COMMENT ON TABLE sg_reports_survey.reporting_entities IS 'DEPRECATED: Use report_entity_suggestions instead. Maps document symbols to reporting entities.';
COMMENT ON COLUMN sg_reports_survey.reporting_entities.entity_manual IS 'Lead entity from manual_list.xlsx (preferred source)';
COMMENT ON COLUMN sg_reports_survey.reporting_entities.entity_dri IS 'Entity from dri.xlsx (fallback source)';
COMMENT ON COLUMN sg_reports_survey.reporting_entities.entity IS 'Computed preferred entity: manual first, then dri';

--------------------------------------------------------------------------------
-- REPORT ENTITY SUGGESTIONS TABLE (NEW)
-- Stores multiple entity suggestions per report series from different sources
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sg_reports_survey.report_entity_suggestions (
  id SERIAL PRIMARY KEY,
  
  -- Report series identifier (matches documents.proper_title)
  proper_title TEXT NOT NULL,
  
  -- Entity reference (FK to systemchart.entities master list)
  entity TEXT NOT NULL REFERENCES systemchart.entities(entity),
  
  -- Source of this suggestion
  source TEXT NOT NULL CHECK (source IN ('dgacm', 'dri', 'ai')),
  
  -- Confidence score for fuzzy/AI matches (0.000 to 1.000)
  confidence_score NUMERIC(4,3) CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  
  -- Details about how the match was made (symbol matched, fuzzy score, AI reasoning, etc.)
  match_details JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One suggestion per entity+source per report series
  CONSTRAINT unique_suggestion_per_source UNIQUE (proper_title, entity, source)
);

-- Indexes for report_entity_suggestions
CREATE INDEX IF NOT EXISTS idx_suggestions_proper_title ON sg_reports_survey.report_entity_suggestions (proper_title);
CREATE INDEX IF NOT EXISTS idx_suggestions_entity ON sg_reports_survey.report_entity_suggestions (entity);
CREATE INDEX IF NOT EXISTS idx_suggestions_source ON sg_reports_survey.report_entity_suggestions (source);
CREATE INDEX IF NOT EXISTS idx_suggestions_confidence ON sg_reports_survey.report_entity_suggestions (confidence_score DESC NULLS LAST);

-- Comments
COMMENT ON TABLE sg_reports_survey.report_entity_suggestions IS 'Entity suggestions for report series from various sources (DGACM, DRI, AI)';
COMMENT ON COLUMN sg_reports_survey.report_entity_suggestions.proper_title IS 'Report series identifier - matches documents.proper_title';
COMMENT ON COLUMN sg_reports_survey.report_entity_suggestions.entity IS 'Suggested entity (FK to systemchart.entities)';
COMMENT ON COLUMN sg_reports_survey.report_entity_suggestions.source IS 'Source of suggestion: dgacm, dri, or ai';
COMMENT ON COLUMN sg_reports_survey.report_entity_suggestions.confidence_score IS 'Match confidence 0-1 (NULL for exact matches like DGACM)';
COMMENT ON COLUMN sg_reports_survey.report_entity_suggestions.match_details IS 'JSON with match details: symbol_matched, fuzzy_score, ai_reasoning, etc.';

--------------------------------------------------------------------------------
-- REPORT ENTITY CONFIRMATIONS TABLE (NEW)
-- Records when entity representatives confirm ownership of reports
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sg_reports_survey.report_entity_confirmations (
  id SERIAL PRIMARY KEY,
  
  -- Report series identifier (matches documents.proper_title)
  proper_title TEXT NOT NULL,
  
  -- Entity that is confirmed as owner (FK to systemchart.entities)
  entity TEXT NOT NULL REFERENCES systemchart.entities(entity),
  
  -- Who confirmed this (FK to users table)
  confirmed_by_user_id UUID NOT NULL REFERENCES sg_reports_survey.users(id),
  
  -- When the confirmation was made
  confirmed_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Optional notes about the confirmation
  notes TEXT,
  
  -- One confirmation per entity per report series
  CONSTRAINT unique_confirmation_per_entity UNIQUE (proper_title, entity)
);

-- Indexes for report_entity_confirmations
CREATE INDEX IF NOT EXISTS idx_confirmations_proper_title ON sg_reports_survey.report_entity_confirmations (proper_title);
CREATE INDEX IF NOT EXISTS idx_confirmations_entity ON sg_reports_survey.report_entity_confirmations (entity);
CREATE INDEX IF NOT EXISTS idx_confirmations_user ON sg_reports_survey.report_entity_confirmations (confirmed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_confirmations_date ON sg_reports_survey.report_entity_confirmations (confirmed_at DESC);

-- Comments
COMMENT ON TABLE sg_reports_survey.report_entity_confirmations IS 'User confirmations that a report belongs to their entity';
COMMENT ON COLUMN sg_reports_survey.report_entity_confirmations.proper_title IS 'Report series identifier - matches documents.proper_title';
COMMENT ON COLUMN sg_reports_survey.report_entity_confirmations.entity IS 'Entity confirmed as owner (FK to systemchart.entities)';
COMMENT ON COLUMN sg_reports_survey.report_entity_confirmations.confirmed_by_user_id IS 'User who made the confirmation';
COMMENT ON COLUMN sg_reports_survey.report_entity_confirmations.confirmed_at IS 'Timestamp of confirmation';
COMMENT ON COLUMN sg_reports_survey.report_entity_confirmations.notes IS 'Optional notes about the confirmation';
