-- Migration: add reminder_sent_at column to users table
-- Tracks when the last survey reminder email was sent to each user.
-- Used by /api/cron/send-reminders to enforce per-user rate limiting.
--
-- Run: psql $DATABASE_URL -f sql/migrations/add_reminder_sent_at.sql

ALTER TABLE sg_reports_survey.users
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN sg_reports_survey.users.reminder_sent_at
  IS 'Timestamp of the last survey reminder email sent to this user. NULL if no reminder has been sent.';

CREATE INDEX IF NOT EXISTS idx_users_reminder_sent_at
  ON sg_reports_survey.users (reminder_sent_at)
  WHERE reminder_sent_at IS NOT NULL;
