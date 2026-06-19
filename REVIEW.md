# Code Review — UN80 SG Reports Survey

Review date: 2026-06-19  
Commit reviewed: `da88f68` (main branch)  
Reviewer: automated code review via Claude Code

---

## Overview

This is a Next.js 15 application for the UN Secretary-General Reports Survey (UN80 initiative). Authenticated UN staff review and submit recommendations on SG reports. An admin layer provides export, analysis, and an AI chat assistant backed by Azure OpenAI with vector similarity search (pgvector).

The app is built on a PostgreSQL backend with a multi-schema design (`sg_reports_survey` for app data, `systemchart` for the shared entity master list). A Python pipeline (6 scripts) ingests report data and generates embeddings.

---

## Security Issues

### Critical

**[SEC-1] Missing authentication on `/api/export/entities` (POST)**  
File: `src/app/api/export/entities/route.ts`  
This endpoint accepts arbitrary JSON from the request body and returns a formatted Excel file. There is **no authentication check** — any unauthenticated caller can POST data and download an Excel. The sibling endpoint `/api/export/survey` correctly requires `user.role === 'admin'`.  
Fix: Add `getCurrentUser()` check and enforce `user.role === 'admin'`.

**[SEC-2] Entity confirmation DELETE allows users to remove other users' confirmations**  
File: `src/app/api/entity-confirmations/route.ts` (~line 168)  
When the authenticated user's entity matches the entity being deleted, the query is `WHERE proper_title = $1 AND entity = $2` — no `confirmed_by_user_id` filter. Any user from entity X can delete all confirmations made by any other user of entity X.  
Fix: Add `AND confirmed_by_user_id = $3` to the entity-match branch.

### High

**[SEC-3] `pg_` keyword block in `isQuerySafe()` is ineffective**  
File: `src/lib/chat-tools.ts`  
The pattern `\bpg_\b` uses word boundaries, but `_` is a word character, so `\b` before `pg_` never creates a true boundary. Functions like `pg_read_file('...')` pass the check.  
Fix: Use `sql.toLowerCase().includes('pg_')` or the regex `/pg_\w+/i`.

**[SEC-4] `DB_SCHEMA` env var injected into raw SQL**  
File: `src/lib/db.ts`  
The env var is interpolated without sanitization into `SET search_path TO ${dbSchema}, public`. Validate `DB_SCHEMA` against a strict identifier pattern (`/^[a-z_][a-z0-9_]*$/i`) at startup.

### Medium

**[SEC-5] No explicit authentication guard in the chat route**  
File: `src/app/api/chat/route.ts`  
The session is read for logging but no 401 is returned if the session is absent. Middleware handles route protection but direct API calls bypass middleware.  
Fix: Add `if (!session) return new Response('Unauthorized', { status: 401 })`.

**[SEC-6] No rate limiting on the AI chat endpoint**  
The agentic loop can make up to 10 Azure OpenAI calls per request with no per-user throttle, creating a cost amplification risk.

**[SEC-7] Unbounded `limit` parameter in `/api/sg-reports`**  
File: `src/app/api/sg-reports/route.ts`  
`limit` is accepted from the query string without validation. Clamp to a maximum (e.g., `Math.min(limit, 100)`).

---

## Bugs

**[BUG-1] `auth_tables.sql` out of sync with live schema**  
File: `sql/auth_tables.sql`  
The base schema defines `users.role TEXT CHECK (role IN ('user', 'admin'))`. Migration `007_admin_emails_whitelist.sql` drops this column and creates an `admin_emails` table instead. A fresh database provisioned from `auth_tables.sql` alone will not have `admin_emails` and `getCurrentUser()` will silently return all users as non-admin.  
Fix: Update `auth_tables.sql` to remove the `role` column and add the `admin_emails` table.

**[BUG-2] `readDocument()` in chat tools uses the privileged pool**  
File: `src/lib/chat-tools.ts`  
`readDocument()` calls `query()` (main pool) rather than `chatQuery()` (restricted user), giving the AI access to all table columns including potentially sensitive metadata.  
Fix: Route `readDocument()` through `chatQuery()`.

**[BUG-3] Known dashboard bug (tracked in TODO.md)**  
The survey status column in the entity dashboard reads from `my-responses` only and shows 'Go to survey' for one-time confirmed reports — a regression from the multi-response migration. See `docs/TODO.md`.

---

## Schema Issues

**[SCHEMA-1] No consolidated provisioning path**  
The `sql/` directory requires running files in an order that is not documented anywhere: `auth_tables.sql` → `reports_tables.sql` → `survey_responses_table.sql` → `report_frequencies_table.sql` → `frequency_confirmations_table.sql` → `views.sql` → all migrations in order → `create_chat_user.sql`. `schema/current_schema.sql` exists but it is unclear if it is kept current after each migration.

**[SCHEMA-2] `systemchart.entities` is an undocumented external dependency**  
This table is referenced in `sql/reports_tables.sql` (FK) and `src/app/api/entity-confirmations/route.ts` (validation query) but is never defined or documented in this repository. If it doesn't exist, all entity confirmation POSTs fail with a cryptic DB error.

---

## Documentation Gaps

1. **README.md** is the generic boilerplate template and does not describe the actual application, its purpose, the Python pipeline, required env vars (`DATABASE_URL_CHAT`, `AZURE_OPENAI_*`), or the admin whitelist pattern.
2. **No Python pipeline setup guide** — scripts 01–06 have no documentation explaining execution order, required credentials, or data sources.
3. **`DATABASE_URL_CHAT`** env var (used in `src/lib/db-chat.ts`) is not mentioned in any documentation or `.env.template`.
4. **`systemchart` schema dependency** is undocumented (see SCHEMA-2 above).
5. **Migration 007** removes `users.role` but `auth_tables.sql` still defines it — the base file and migration log are diverged.

---

## Code Quality

**[QUALITY-1] Array casting workaround in sg-reports query**  
Multiple filter arrays use `as unknown as string` to satisfy the `pg` driver. Use explicit `$N::text[]` SQL casts instead.

**[QUALITY-2] `DB_SCHEMA` redefined in every route file**  
`src/lib/config.ts` exports `DB_SCHEMA` for this purpose; the per-file redefinitions should be replaced with imports from config.

**[QUALITY-3] Count query duplicates main CTE**  
In `sg-reports/route.ts`, the count query repeats the entire CTE body independently rather than wrapping the main CTE with `SELECT COUNT(*)`, creating a maintenance burden.

---

## Test Opportunities

There are zero automated tests in this repository. Highest-value targets:

1. `isQuerySafe()` — unit tests with known-safe and known-dangerous SQL patterns (including `pg_read_file`, `DROP TABLE`, `UPDATE`)
2. Auth session: `verifySession()` with tampered, expired, and valid tokens
3. Survey response API: upsert idempotency, entity scope isolation, DELETE own-only enforcement
4. Entity confirmation DELETE: verify a user from entity X cannot delete another user's confirmation from entity X
5. Export endpoints: 401/403 for unauthenticated/non-admin callers on both export routes
6. `isAllowedDomain()`: global domain (`un.org`), entity-specific domain, unknown domain
7. Manual report symbol validation with edge cases
8. Middleware route protection: unauthenticated redirect, `/about` and `/login` accessible without auth
