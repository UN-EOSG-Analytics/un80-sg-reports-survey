# Code Review — un80-sg-reports-survey

*Generated June 2026. ~850 words.*

---

## 1. Architecture

### Magic Link Auth Flow
Authentication is entirely passwordless. Users enter their email on `/login`; `src/lib/auth.ts` generates a 32-byte hex token (via `randomBytes(32)`), stores it in `sg_reports_survey.magic_tokens` with a 15-minute expiry, and sends a link via Nodemailer. A 2-minute rate-limit prevents token floods by blocking new tokens when an unused token was issued in the last 2 minutes (`recentTokenExists`). On `/verify`, `verifyMagicToken` atomically marks the token `used_at = NOW()` in a single `UPDATE … RETURNING` — replay is impossible once used. Session cookies are self-contained JWTs: `signSession` encodes `{userId, exp}` as base64 and appends an HMAC-SHA256 signature. `verifySession` uses `timingSafeEqual` to prevent timing attacks. Sessions last 30 days.

### Survey Workflow
Each UN entity nominates the SG reports it is responsible for via a confirmation table (`report_entity_confirmations`). Users then progress through a two-step sidebar workflow per report: (1) confirm or adjust the report's recurring frequency, and (2) submit a structured survey response (`continue` / `merge` / `discontinue` + frequency + format + free-text comments). Survey responses live in `sg_reports_survey.survey_responses`, keyed `(proper_title, normalized_body, responded_by_user_id)`.

### AI Chat Integration
`/api/chat` exposes a streaming Azure OpenAI (GPT-4o) chat endpoint with two tool calls: `read_document` (fetches full document text from `documents`) and `query_database` (runs read-only SQL through a dedicated `chat_readonly` DB role). A keyword blocklist (`isQuerySafe`) and a hard 100-row `LIMIT` cap guard the tool. Interactions are logged to `ai_chat_logs`.

### Python Pipeline
Six numbered scripts populate the database before the app is used:
1. `01_get_reports.py` — scrapes UN Digital Library, inserts into `documents`
2. `02_populate_reporting_entities.py` — seeds entity suggestions from DGACM/DRI sources
3. `03_generate_embeddings.py` — calls text-embedding-3-large, writes `vector(1024)` embeddings
4. `04_extract_mandate_info.py` — extracts mandate/resolution links per report
5. `05_ai_entity_suggestions.py` — AI-driven entity matching against `systemchart.entities`
6. `06_calculate_frequencies.py` — computes `calculated_frequency` from publication gaps

Re-run scripts (in order) when source data changes; each is idempotent.

---

## 2. Critical Issues

### Bug 1 — Survey Column Reads Only the Current User's Responses (HIGH)
`SGReportsList.tsx:1548` fetches `/api/survey-responses/my-responses`, which returns only rows `WHERE responded_by_user_id = $1` (the current user). The "Survey" column therefore shows "Completed" only if *this specific user* submitted a response — it misses responses submitted by colleagues in the same entity. Users incorrectly believe a report is unresolved when a teammate already responded. **Impact:** misleading dashboard state, duplicate survey effort. Fix: the column should reflect *any* response from the entity, not just the logged-in user's.

### Bug 2 — "Go to survey" Badge Shown for Confirmed One-Time Reports (HIGH)
`ReportRow` (line 1035) falls through to the "Go to survey" badge whenever `isConfirmedByEntity` is true and `surveyResponse` is absent. One-time reports confirmed in the frequency step already satisfy the workflow (the sidebar marks Step 2 complete for them), but the dashboard badge ignores `confirmedFrequency`. Users see a misleading call-to-action on reports already resolved. Fix: suppress the badge when `report.confirmedFrequency === "one-time"` and the entity has confirmed it.

### Bug 3 — Multi-Entity One-Time Confirmation Edge Case (MEDIUM — Schema Limitation)
`report_frequency_confirmations` has a unique constraint on `(proper_title)` without an entity column — only one entity can write a frequency confirmation per report. When two entities both confirm the same report as "one-time", the second confirmation overwrites the first's `confirmed_by` metadata, and the first entity loses per-entity credit. Fixing this properly requires an `entity` column in `report_frequency_confirmations` and a schema migration. Documented in `docs/TODO.md`.

### No Test Coverage (HIGH)
Zero automated tests exist. The only executable is `scripts/test-chat.ts`, an integration smoke test requiring a live DB and real API keys. Any refactor to auth, survey logic, or chat tools is unverifiable without manual testing.

### Missing CLAUDE.md (LOW)
No `CLAUDE.md` existed before this PR. AI agents have no guidance on architecture, env vars, or conventions.

---

## 3. Security Considerations

- **JWT replay** — tokens are single-use (atomic `UPDATE … used_at`). Sessions have no server-side revocation; a stolen 30-day cookie is valid until expiry. Consider a short-lived session with a refresh mechanism, or store a session ID in the DB.
- **`query_database` SQL injection** — the keyword blocklist (`isQuerySafe`) is defense-in-depth only; it is bypassable (e.g. `SELECT … FROM generate_series` could leak info). The real guard is the `chat_readonly` DB role, which must be granted only to safe tables. Audit grants carefully and test with a minimal-privilege role.
- **Admin access control** — `role` is derived from `admin_emails` at query time (`getCurrentUser`), not stored in the session. Adding/removing an admin email takes effect immediately — good. But the admin email table itself has no UI; it must be managed directly in the database.
- **`AUTH_SECRET` fallback** — in development, the secret falls back to `"dev-secret-change-me"`. If an app is accidentally deployed to staging without `AUTH_SECRET` set, it will sign real sessions with a known key.
- **Token expiry on magic link** — 15 minutes is reasonable, but the link URL exposes the token in server logs and email metadata. Consider a one-time redirect that immediately exchanges the token for a cookie.

---

## 4. Code Quality

- **`config.ts`** — clean schema-prefixed table name approach. All auth tables use it. However, `survey_responses`, `documents`, and other app tables hardcode `process.env.DB_SCHEMA || "sg_reports_survey"` directly in each route file, bypassing `config.ts`. This creates drift risk.
- **Chat prompt engineering** — system prompt in `/api/chat/route.ts` is well-structured, providing schema context. The agentic loop with tool calls is correctly implemented.
- **`my-responses` vs entity responses** — the separation of concerns between per-user and per-entity responses is architecturally sound; only the dashboard presentation incorrectly uses the user-scoped endpoint.

---

## 5. Ranked Refactor Opportunities

1. **Centralize DB_SCHEMA** — all routes should import `DB_SCHEMA` from `src/lib/config.ts` instead of re-declaring `const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey"`.
2. **Fix survey completion source** — switch the dashboard survey column to use entity-level responses, not user-level (Bug 1).
3. **Add `entity` column to `report_frequency_confirmations`** — resolves Bug 3 and enables proper per-entity credit for one-time confirmations.
4. **Add unit tests** — at minimum for `auth.ts` (token generation, session signing/verification) and `chat-tools.ts` (SQL safety checker).
5. **Replace `query_database` keyword blocklist with schema-level isolation** — enforce via a true read-only Postgres role with explicit GRANTs; remove the brittle regex approach.
6. **Session revocation** — add a `sessions` table to allow logout-all and admin force-logout.
7. **Deduplicate DB_SCHEMA declarations** — extend `config.ts` to export app-specific table names (documents, survey_responses, etc.) alongside auth table names.

---

## 6. Suggested New Features

| Feature | Value |
|---|---|
| **Survey completion progress bar per entity** | Visual overview of how far along an entity's team is — useful for coordinators |
| **Email reminders for incomplete surveys** | Cron-triggered nudges to entities with confirmed reports but no survey response |
| **Mandate deduplication interface** | Admin UI to merge near-duplicate report series before users assign them |
| **Export survey data to PDF report** | Printable summary of all entity responses per SG reporting cycle |
| **Dashboard comparison between entities** | Side-by-side view of survey outcomes across entities (admin only) |
| **Frequency trend visualization over multiple years** | Chart of publication gaps from `report_frequencies` to surface outliers |
