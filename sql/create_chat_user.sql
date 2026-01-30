-- Create a restricted user for the AI chat feature
-- This user can only SELECT from specific tables in sg_reports_survey schema

-- Create the user (run as superuser/admin)
-- Password should be set via environment variable in production
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'chat_readonly') THEN
    CREATE USER chat_readonly WITH PASSWORD 'CHANGE_THIS_PASSWORD';
  END IF;
END
$$;

-- Revoke all default privileges on both schemas
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM chat_readonly;
REVOKE ALL ON ALL TABLES IN SCHEMA sg_reports_survey FROM chat_readonly;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA sg_reports_survey FROM chat_readonly;
REVOKE ALL ON SCHEMA public FROM chat_readonly;

-- Grant connect to database
GRANT CONNECT ON DATABASE postgres TO chat_readonly;

-- Grant usage on the sg_reports_survey schema
GRANT USAGE ON SCHEMA sg_reports_survey TO chat_readonly;

-- Grant SELECT only on allowed tables/views in sg_reports_survey schema
GRANT SELECT ON sg_reports_survey.documents TO chat_readonly;

-- Grant on views/tables if they exist (using DO block for conditional grants)
DO $$
BEGIN
  -- Views
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'sg_reports_survey' AND tablename = 'sg_reports') 
     OR EXISTS (SELECT FROM pg_views WHERE schemaname = 'sg_reports_survey' AND viewname = 'sg_reports') THEN
    EXECUTE 'GRANT SELECT ON sg_reports_survey.sg_reports TO chat_readonly';
  END IF;
  
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'sg_reports_survey' AND tablename = 'latest_versions')
     OR EXISTS (SELECT FROM pg_views WHERE schemaname = 'sg_reports_survey' AND viewname = 'latest_versions') THEN
    EXECUTE 'GRANT SELECT ON sg_reports_survey.latest_versions TO chat_readonly';
  END IF;
  
  -- Tables
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'sg_reports_survey' AND tablename = 'report_entity_suggestions') THEN
    EXECUTE 'GRANT SELECT ON sg_reports_survey.report_entity_suggestions TO chat_readonly';
  END IF;
  
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'sg_reports_survey' AND tablename = 'report_entity_confirmations') THEN
    EXECUTE 'GRANT SELECT ON sg_reports_survey.report_entity_confirmations TO chat_readonly';
  END IF;
  
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'sg_reports_survey' AND tablename = 'report_frequencies') THEN
    EXECUTE 'GRANT SELECT ON sg_reports_survey.report_frequencies TO chat_readonly';
  END IF;
  
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'sg_reports_survey' AND tablename = 'report_frequency_confirmations') THEN
    EXECUTE 'GRANT SELECT ON sg_reports_survey.report_frequency_confirmations TO chat_readonly';
  END IF;
  
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'sg_reports_survey' AND tablename = 'survey_responses') THEN
    EXECUTE 'GRANT SELECT ON sg_reports_survey.survey_responses TO chat_readonly';
  END IF;
  
  -- Explicitly revoke access to sensitive tables if they exist
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'sg_reports_survey' AND tablename = 'users') THEN
    EXECUTE 'REVOKE ALL ON sg_reports_survey.users FROM chat_readonly';
  END IF;
  
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'sg_reports_survey' AND tablename = 'magic_tokens') THEN
    EXECUTE 'REVOKE ALL ON sg_reports_survey.magic_tokens FROM chat_readonly';
  END IF;
END
$$;

-- Set default search_path for the user to sg_reports_survey
ALTER USER chat_readonly SET search_path TO sg_reports_survey;

-- Verify permissions (run these to check)
-- SELECT grantee, table_schema, table_name, privilege_type 
-- FROM information_schema.table_privileges 
-- WHERE grantee = 'chat_readonly';
