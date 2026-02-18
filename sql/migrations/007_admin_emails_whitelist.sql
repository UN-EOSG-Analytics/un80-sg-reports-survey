-- Migration 007: Replace users.role column with a dedicated admin_emails whitelist table.
--
-- Why: Whitelist table is easier to audit and manage (INSERT/DELETE rows)
-- without touching the users table. Role is now derived via JOIN at query time.

-- 1. Create the whitelist table
CREATE TABLE sg_reports_survey.admin_emails (
  email text NOT NULL PRIMARY KEY
);

COMMENT ON TABLE sg_reports_survey.admin_emails IS
  'Whitelist of email addresses that receive admin privileges. ';

-- 2. Seed: migrate all current admins from the users table
INSERT INTO sg_reports_survey.admin_emails (email)
SELECT email
FROM   sg_reports_survey.users
WHERE  role = 'admin'
ON CONFLICT DO NOTHING;

-- 3. Remove the now-redundant role column (and its check constraint) from users
ALTER TABLE sg_reports_survey.users
  DROP CONSTRAINT IF EXISTS users_role_check,
  DROP COLUMN IF EXISTS role;
