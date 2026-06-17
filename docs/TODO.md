# Known Issues

These are tracked open issues. File as GitHub issues when prioritising.

## Open

- **One-time confirmed reports show wrong badge** (`src/components/SGReportsList.tsx`): The dashboard survey column still reads only from `survey_responses`. Reports confirmed as `one-time` via `report_frequency_confirmations` still display a “Go to survey” badge rather than a completion badge. Fix: join `report_frequency_confirmations` in the dashboard query.

- **Multi-entity one-time credit race condition**: If two entities are assigned the same report and both confirm it as `one-time`, only the last confirming entity gets per-entity credit. This is a schema limitation of `report_frequency_confirmations` (no entity column). Fix: add `entity` or `user_id` scope to `report_frequency_confirmations`.

## Recently Fixed

- Migration 007 replaced `users.role` column with `admin_emails` whitelist table (see `sql/migrations/007_admin_emails_whitelist.sql`).
- Migration 008 fixed the `frequency` check constraint to include all valid values.
