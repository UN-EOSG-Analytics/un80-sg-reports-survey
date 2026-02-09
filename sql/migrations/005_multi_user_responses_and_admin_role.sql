-- Migration: add users.role and convert survey_responses to per-user per-report-body
-- Run: psql $DATABASE_URL -f sql/migrations/005_multi_user_responses_and_admin_role.sql

BEGIN;

-- 1) Users role (admin/user)
ALTER TABLE sg_reports_survey.users
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

ALTER TABLE sg_reports_survey.users
DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE sg_reports_survey.users
ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));

-- 2) Survey responses: add report body key and respondent user id
ALTER TABLE sg_reports_survey.survey_responses
ADD COLUMN IF NOT EXISTS normalized_body TEXT NOT NULL DEFAULT '';

ALTER TABLE sg_reports_survey.survey_responses
ADD COLUMN IF NOT EXISTS responded_by_user_id UUID;

-- Backfill body key from latest_symbol where possible
UPDATE sg_reports_survey.survey_responses
SET normalized_body = CASE
  WHEN latest_symbol LIKE 'A/HRC/%' THEN 'Human Rights Council'
  WHEN latest_symbol LIKE 'A/%' THEN 'General Assembly'
  WHEN latest_symbol LIKE 'E/%' THEN 'Economic and Social Council'
  WHEN latest_symbol LIKE 'S/%' THEN 'Security Council'
  ELSE ''
END
WHERE COALESCE(normalized_body, '') = '';

-- Ensure users exist for historic audit emails before backfill
INSERT INTO sg_reports_survey.users (email, entity)
SELECT DISTINCT LOWER(sr.updated_by_email), sr.user_entity
FROM sg_reports_survey.survey_responses sr
LEFT JOIN sg_reports_survey.users u ON LOWER(u.email) = LOWER(sr.updated_by_email)
WHERE sr.responded_by_user_id IS NULL
  AND sr.updated_by_email IS NOT NULL
  AND u.id IS NULL;

INSERT INTO sg_reports_survey.users (email, entity)
SELECT DISTINCT LOWER(sr.created_by_email), sr.user_entity
FROM sg_reports_survey.survey_responses sr
LEFT JOIN sg_reports_survey.users u ON LOWER(u.email) = LOWER(sr.created_by_email)
WHERE sr.responded_by_user_id IS NULL
  AND sr.created_by_email IS NOT NULL
  AND u.id IS NULL;

-- Backfill respondent user id from audit emails
UPDATE sg_reports_survey.survey_responses sr
SET responded_by_user_id = u.id
FROM sg_reports_survey.users u
WHERE sr.responded_by_user_id IS NULL
  AND LOWER(u.email) = LOWER(sr.updated_by_email);

UPDATE sg_reports_survey.survey_responses sr
SET responded_by_user_id = u.id
FROM sg_reports_survey.users u
WHERE sr.responded_by_user_id IS NULL
  AND LOWER(u.email) = LOWER(sr.created_by_email);

-- Any remaining rows cannot be mapped safely; remove them instead of creating orphaned records
DELETE FROM sg_reports_survey.survey_responses
WHERE responded_by_user_id IS NULL;

ALTER TABLE sg_reports_survey.survey_responses
ALTER COLUMN responded_by_user_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'survey_responses_responded_by_user_id_fkey'
  ) THEN
    ALTER TABLE sg_reports_survey.survey_responses
      ADD CONSTRAINT survey_responses_responded_by_user_id_fkey
      FOREIGN KEY (responded_by_user_id)
      REFERENCES sg_reports_survey.users(id);
  END IF;
END
$$;

-- Replace legacy uniqueness (per entity) with per-user+body
ALTER TABLE sg_reports_survey.survey_responses
DROP CONSTRAINT IF EXISTS survey_responses_proper_title_user_entity_key;

ALTER TABLE sg_reports_survey.survey_responses
DROP CONSTRAINT IF EXISTS survey_responses_unique_per_user_per_report_body;

ALTER TABLE sg_reports_survey.survey_responses
ADD CONSTRAINT survey_responses_unique_per_user_per_report_body
UNIQUE (proper_title, normalized_body, responded_by_user_id);

-- Supporting indexes
CREATE INDEX IF NOT EXISTS idx_responses_normalized_body
  ON sg_reports_survey.survey_responses (normalized_body);

CREATE INDEX IF NOT EXISTS idx_responses_user_id
  ON sg_reports_survey.survey_responses (responded_by_user_id);

COMMIT;

-- Optional helper:
-- UPDATE sg_reports_survey.users SET role = 'admin' WHERE email = 'name@un.org';
