-- Migration: remove redundant email audit columns from survey responses
-- Run: psql $DATABASE_URL -f sql/migrations/006_drop_response_email_audit_columns.sql

BEGIN;

ALTER TABLE sg_reports_survey.survey_responses
DROP COLUMN IF EXISTS created_by_email;

ALTER TABLE sg_reports_survey.survey_responses
DROP COLUMN IF EXISTS updated_by_email;

COMMIT;
