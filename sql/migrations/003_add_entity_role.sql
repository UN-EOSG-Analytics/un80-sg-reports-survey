-- Migration: Add role column to report_entity_confirmations
-- Run: psql $DATABASE_URL -f sql/migrations/003_add_entity_role.sql
--
-- This adds support for lead vs contributing entity roles on report assignments.

BEGIN;

-- Add role column with default 'lead' for backwards compatibility
ALTER TABLE sg_reports_survey.report_entity_confirmations
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'lead';

-- Add check constraint for valid role values
ALTER TABLE sg_reports_survey.report_entity_confirmations
DROP CONSTRAINT IF EXISTS report_entity_confirmations_role_check;

ALTER TABLE sg_reports_survey.report_entity_confirmations
ADD CONSTRAINT report_entity_confirmations_role_check 
CHECK (role IN ('lead', 'contributing'));

-- Add index for efficient queries by role
CREATE INDEX IF NOT EXISTS idx_confirmations_role 
ON sg_reports_survey.report_entity_confirmations (proper_title, role);

COMMIT;

-- Recreate the report_entities view to include lead/contributing arrays
-- (Views need to be recreated when underlying columns change)

\echo 'Recreating views to include role information...'

-- Drop dependent view first
DROP VIEW IF EXISTS sg_reports_survey.latest_versions;
DROP VIEW IF EXISTS sg_reports_survey.report_entities;

-- Recreate report_entities view with role support
CREATE VIEW sg_reports_survey.report_entities AS
WITH suggestions_agg AS (
  -- Aggregate all suggestions per proper_title
  SELECT 
    proper_title,
    jsonb_agg(
      jsonb_build_object(
        'entity', entity,
        'source', source,
        'confidence_score', confidence_score,
        'match_details', match_details,
        'created_at', created_at
      ) ORDER BY 
        -- Prioritize: higher confidence, then dgacm > dri > ai
        confidence_score DESC NULLS LAST,
        CASE source WHEN 'dgacm' THEN 1 WHEN 'dri' THEN 2 WHEN 'ai' THEN 3 END
    ) as suggestions,
    array_agg(DISTINCT entity ORDER BY entity) as suggested_entities
  FROM sg_reports_survey.report_entity_suggestions
  GROUP BY proper_title
),
confirmations_agg AS (
  -- Aggregate all confirmations per proper_title
  SELECT 
    c.proper_title,
    jsonb_agg(
      jsonb_build_object(
        'entity', c.entity,
        'role', c.role,
        'confirmed_by_user_id', c.confirmed_by_user_id,
        'confirmed_by_email', u.email,
        'confirmed_at', c.confirmed_at,
        'notes', c.notes
      ) ORDER BY 
        -- Lead entities first, then by confirmation time
        CASE c.role WHEN 'lead' THEN 0 ELSE 1 END,
        c.confirmed_at DESC
    ) as confirmations,
    array_agg(DISTINCT c.entity ORDER BY c.entity) as confirmed_entities,
    -- Separate arrays for lead and contributing entities
    array_agg(DISTINCT c.entity ORDER BY c.entity) FILTER (WHERE c.role = 'lead') as lead_entities,
    array_agg(DISTINCT c.entity ORDER BY c.entity) FILTER (WHERE c.role = 'contributing') as contributing_entities
  FROM sg_reports_survey.report_entity_confirmations c
  LEFT JOIN sg_reports_survey.users u ON c.confirmed_by_user_id = u.id
  GROUP BY c.proper_title
)
SELECT 
  COALESCE(s.proper_title, c.proper_title) as proper_title,
  s.suggestions,
  s.suggested_entities,
  c.confirmations,
  c.confirmed_entities,
  c.lead_entities,
  c.contributing_entities,
  -- Primary entity: first lead, then first confirmed, then highest-confidence suggestion
  COALESCE(
    c.lead_entities[1],
    c.confirmed_entities[1],
    s.suggested_entities[1]
  ) as primary_entity,
  -- Has any confirmation?
  (c.proper_title IS NOT NULL) as has_confirmation
FROM suggestions_agg s
FULL OUTER JOIN confirmations_agg c ON s.proper_title = c.proper_title;

COMMENT ON VIEW sg_reports_survey.report_entities IS 'Combined view of entity suggestions and confirmations per report series, with lead/contributing role support';

-- Recreate latest_versions view (depends on report_entities)
CREATE VIEW sg_reports_survey.latest_versions AS
WITH normalized AS (
  -- Normalize body from symbol prefix (more reliable than un_body which can contain multiple bodies)
  SELECT r.*,
         CASE 
           WHEN r.symbol LIKE 'A/HRC/%' THEN 'Human Rights Council'
           WHEN r.symbol LIKE 'A/%' THEN 'General Assembly'
           WHEN r.symbol LIKE 'E/%' THEN 'Economic and Social Council'
           WHEN r.symbol LIKE 'S/%' THEN 'Security Council'
           ELSE COALESCE(
             CASE 
               WHEN r.un_body LIKE '{%}' THEN SUBSTRING(r.un_body FROM '^\{"?([^",}]+)"?')
               ELSE r.un_body
             END,
             'Other'
           )
         END as normalized_body,
         COALESCE(r.date_year, 
           CASE WHEN r.publication_date ~ '^\d{4}' 
           THEN SUBSTRING(r.publication_date FROM 1 FOR 4)::int END
         ) as effective_year
  FROM sg_reports_survey.sg_reports r
),
version_counts AS (
  -- Count versions per (proper_title, normalized_body) group
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

-- Re-grant permissions to chat_readonly if it exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'chat_readonly') THEN
    EXECUTE 'GRANT SELECT ON sg_reports_survey.report_entities TO chat_readonly';
    EXECUTE 'GRANT SELECT ON sg_reports_survey.latest_versions TO chat_readonly';
    RAISE NOTICE 'Granted SELECT on views to chat_readonly';
  END IF;
END
$$;

\echo 'Migration complete: Added role column to report_entity_confirmations'
\echo 'Existing confirmations default to role=lead'
