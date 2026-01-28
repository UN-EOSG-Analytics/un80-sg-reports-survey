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
-- REPORTING ENTITIES TABLE
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
COMMENT ON TABLE sg_reports_survey.reporting_entities IS 'Maps document symbols to reporting entities from manual_list.xlsx and dri.xlsx';
COMMENT ON COLUMN sg_reports_survey.reporting_entities.entity_manual IS 'Lead entity from manual_list.xlsx (preferred source)';
COMMENT ON COLUMN sg_reports_survey.reporting_entities.entity_dri IS 'Entity from dri.xlsx (fallback source)';
COMMENT ON COLUMN sg_reports_survey.reporting_entities.entity IS 'Computed preferred entity: manual first, then dri';
