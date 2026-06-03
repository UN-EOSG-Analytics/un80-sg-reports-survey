-- Public-facing site support: views and read-only role.
--
-- The public deployment (branch: public-page) connects to Postgres using
-- `sg_reports_public_reader`. The role has SELECT only on report content
-- and the *_public views below. It cannot SELECT survey_responses,
-- report_entity_confirmations, report_frequency_confirmations, users,
-- magic_tokens, allowed_domains, or ai_chat_*.

--------------------------------------------------------------------------------
-- report_entities_public
-- Mirrors report_entities but rebuilt without joining to users,
-- so no confirmer email or user_id can ever flow out.
-- Drops the `confirmations` JSON column entirely (it carried emails).
--------------------------------------------------------------------------------
CREATE OR REPLACE VIEW sg_reports_survey.report_entities_public AS
WITH suggestions_agg AS (
  SELECT
    proper_title,
    jsonb_agg(
      jsonb_build_object(
        'entity', entity,
        'source', source,
        'confidence_score', confidence_score
      ) ORDER BY
        confidence_score DESC NULLS LAST,
        CASE source WHEN 'dgacm' THEN 1 WHEN 'dri' THEN 2 WHEN 'ai' THEN 3 END
    ) AS suggestions,
    array_agg(DISTINCT entity ORDER BY entity) AS suggested_entities
  FROM sg_reports_survey.report_entity_suggestions
  GROUP BY proper_title
),
confirmations_agg AS (
  -- No user join, no emails, no user_ids, no timestamps.
  SELECT
    c.proper_title,
    array_agg(DISTINCT c.entity ORDER BY c.entity) AS confirmed_entities,
    array_agg(DISTINCT c.entity ORDER BY c.entity) FILTER (WHERE c.role = 'lead') AS lead_entities,
    array_agg(DISTINCT c.entity ORDER BY c.entity) FILTER (WHERE c.role = 'contributing') AS contributing_entities
  FROM sg_reports_survey.report_entity_confirmations c
  GROUP BY c.proper_title
)
SELECT
  COALESCE(s.proper_title, c.proper_title) AS proper_title,
  s.suggestions,
  s.suggested_entities,
  c.confirmed_entities,
  c.lead_entities,
  c.contributing_entities,
  COALESCE(
    c.lead_entities[1],
    c.confirmed_entities[1],
    s.suggested_entities[1]
  ) AS primary_entity,
  (c.proper_title IS NOT NULL) AS has_confirmation
FROM suggestions_agg s
FULL OUTER JOIN confirmations_agg c ON s.proper_title = c.proper_title;

COMMENT ON VIEW sg_reports_survey.report_entities_public IS
  'Public-safe entity view: same shape as report_entities minus per-user confirmer identity.';

--------------------------------------------------------------------------------
-- report_frequency_confirmations_public
-- Exposes the user-confirmed frequency value without revealing who confirmed it.
--------------------------------------------------------------------------------
CREATE OR REPLACE VIEW sg_reports_survey.report_frequency_confirmations_public AS
SELECT proper_title, normalized_body, frequency
FROM sg_reports_survey.report_frequency_confirmations;

COMMENT ON VIEW sg_reports_survey.report_frequency_confirmations_public IS
  'Public-safe frequency confirmations: value only, no confirmer identity.';

--------------------------------------------------------------------------------
-- Read-only role for the public deployment.
-- Run once. The password must be set out-of-band before granting access.
--------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sg_reports_public_reader') THEN
    CREATE ROLE sg_reports_public_reader LOGIN PASSWORD 'CHANGE_ME_BEFORE_GRANTING';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA sg_reports_survey TO sg_reports_public_reader;

GRANT SELECT ON
  sg_reports_survey.documents,
  sg_reports_survey.sg_reports,
  sg_reports_survey.latest_versions,
  sg_reports_survey.resolutions,
  sg_reports_survey.sg_report_mandates,
  sg_reports_survey.resolution_mandates,
  sg_reports_survey.report_entity_suggestions,
  sg_reports_survey.report_frequencies,
  sg_reports_survey.report_entities_public,
  sg_reports_survey.report_frequency_confirmations_public
TO sg_reports_public_reader;

-- Defense in depth: explicitly revoke anything that might be granted via PUBLIC
-- on the sensitive tables. (No-ops if PUBLIC has no grants.)
REVOKE ALL ON
  sg_reports_survey.users,
  sg_reports_survey.magic_tokens,
  sg_reports_survey.allowed_domains,
  sg_reports_survey.survey_responses,
  sg_reports_survey.report_entity_confirmations,
  sg_reports_survey.report_frequency_confirmations,
  sg_reports_survey.ai_chat_sessions,
  sg_reports_survey.ai_chat_logs,
  sg_reports_survey.report_entities
FROM sg_reports_public_reader;
