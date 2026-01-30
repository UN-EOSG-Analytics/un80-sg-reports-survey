-- Create a restricted user for the AI chat feature
-- This user can only SELECT from specific tables in sg_reports_survey schema
--
-- Run this script AFTER creating tables and views:
--   psql $DATABASE_URL -f sql/create_chat_user.sql
--
-- If views are recreated (e.g., after running views.sql), re-run this script
-- to restore permissions.

-- Create the user (run as superuser/admin)
-- Password should be set via environment variable in production
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'chat_readonly') THEN
    CREATE USER chat_readonly WITH PASSWORD 'CHANGE_THIS_PASSWORD';
  END IF;
END
$$;

-- Revoke all default privileges
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM chat_readonly;
REVOKE ALL ON ALL TABLES IN SCHEMA sg_reports_survey FROM chat_readonly;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA sg_reports_survey FROM chat_readonly;
REVOKE ALL ON SCHEMA public FROM chat_readonly;

-- Grant connect to database
GRANT CONNECT ON DATABASE postgres TO chat_readonly;

-- Grant usage on the sg_reports_survey schema
GRANT USAGE ON SCHEMA sg_reports_survey TO chat_readonly;

--------------------------------------------------------------------------------
-- ALLOWED TABLES AND VIEWS
-- These are the objects the AI chat can query (must match ALLOWED_TABLES in chat-tools.ts)
--------------------------------------------------------------------------------

-- Main documents table
GRANT SELECT ON sg_reports_survey.documents TO chat_readonly;

-- Views (grant unconditionally - will fail if view doesn't exist yet)
GRANT SELECT ON sg_reports_survey.sg_reports TO chat_readonly;
GRANT SELECT ON sg_reports_survey.latest_versions TO chat_readonly;

-- Survey and frequency tables
GRANT SELECT ON sg_reports_survey.survey_responses TO chat_readonly;
GRANT SELECT ON sg_reports_survey.report_frequencies TO chat_readonly;
GRANT SELECT ON sg_reports_survey.report_frequency_confirmations TO chat_readonly;

-- Entity suggestion/confirmation tables
GRANT SELECT ON sg_reports_survey.report_entity_suggestions TO chat_readonly;
GRANT SELECT ON sg_reports_survey.report_entity_confirmations TO chat_readonly;

--------------------------------------------------------------------------------
-- FORBIDDEN TABLES (explicitly revoke just in case)
--------------------------------------------------------------------------------
REVOKE ALL ON sg_reports_survey.users FROM chat_readonly;
REVOKE ALL ON sg_reports_survey.magic_tokens FROM chat_readonly;

-- Set default search_path for the user
ALTER USER chat_readonly SET search_path TO sg_reports_survey;

--------------------------------------------------------------------------------
-- VERIFY PERMISSIONS
--------------------------------------------------------------------------------
-- Run this query to check what permissions were granted:
--
-- SELECT table_schema, table_name, privilege_type 
-- FROM information_schema.table_privileges 
-- WHERE grantee = 'chat_readonly'
-- ORDER BY table_schema, table_name;
