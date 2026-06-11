# Code Review — un80-sg-reports-survey

## What the Project Does

This is a **Secretary-General Reports Survey** application for the UN Executive Office of the Secretary-General (EOSG). It lets representatives from UN entities (UNDP, UNICEF, WHO, etc.) review a curated list of Secretary-General reports and submit structured recommendations on each report's future:

- **Continue** (as-is, or with changes to frequency/format)
- **Merge** (with another report series)
- **Discontinue**

### System Architecture Overview

```
python/           ← Data ingestion pipeline (run offline by admins)
  01_get_reports.py           - Scrape/import documents from UN library
  02_populate_reporting_entities.py - Map reports → responsible UN entities
  03_generate_embeddings.py   - Generate 1024-dim vectors (text-embedding-3-large)
  04_extract_mandate_info.py  - AI-extract mandate paragraphs from resolutions
  05_ai_entity_suggestions.py - GPT suggest which entity owns each report
  06_calculate_frequencies.py - Compute annual/biennial/etc. from publication history

PostgreSQL (sg_reports_survey schema)
  documents                   - All UN documents (reports, resolutions) with embeddings
  report_entity_suggestions   - AI/DGACM/DRI suggestions: which entity owns which report
  report_entity_confirmations - User confirmations of the above
  report_frequencies          - Pre-computed publication frequency per report series
  survey_responses            - User survey submissions
  report_frequency_confirmations - "This is a one-time report" confirmations
  ai_chat_logs                - Chat session logging for evaluation

Next.js app (src/)
  /                   - Entity dashboard (protected, shows entity's reports)
  /reports            - Browse all SG reports (public within app)
  /analysis           - Admin analytics dashboard
  /stats              - Statistics/treemap visualization
  /about              - Public landing page
  /api/chat           - AI assistant (SSE streaming, agentic with tool use)
  /api/survey-responses - CRUD for survey answers
  /api/export/survey  - Admin Excel export of all responses
  /api/export/entities - Entity-level progress export
  /api/similar-reports - Vector similarity search
```

The AI chatbot (via Azure OpenAI) can read document text, run read-only SQL queries, and perform vector similarity search against the 1024-dim embeddings stored in pgvector.

---

## Code Review Findings

### Ranked Issues

#### 1. CRITICAL — DB_SCHEMA Hardcoded Alongside Config Module (config-drift risk)

**File:** `src/app/analysis/page.tsx`, `src/app/api/survey-responses/route.ts`, `src/app/api/export/survey/route.ts`, and several other API routes.

Multiple files re-declare:
```ts
const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";
```
when `src/lib/config.ts` already exports `DB_SCHEMA`. This means a schema rename requires touching 10+ files. It also creates drift risk: one file might default to `"sg_reports_survey"` while the config module defaults to `"app"` (currently it does—`config.ts` line 2 says `|| "app"`).

**Fix:** All files should import `DB_SCHEMA` from `@/lib/config` and remove their local re-declaration. Update the config default from `"app"` to `"sg_reports_survey"` to match the rest of the codebase.

---

#### 2. HIGH — `query()` Sets `search_path` on Every Connection Checkout (performance + correctness)

**File:** `src/lib/db.ts`

```ts
await client.query(`SET search_path TO ${dbSchema}, public`);
```

This runs on every single query, adding an extra round-trip. It also means the `search_path` injection is in application code rather than the database role definition (where it belongs). Additionally, `dbSchema` is injected by string interpolation — if `DB_SCHEMA` ever contained user-controlled input this would be a SQL injection vector (it is env-controlled so low risk now, but bad pattern).

**Fix:** Set `search_path` at the pool connection level via the `options` parameter in the connection string, or use a pool `connect` event to set it once per physical connection.

---

#### 3. HIGH — `query_database` Tool Checks for Forbidden Keywords But "into" Blocks Legitimate Queries

**File:** `src/lib/chat-tools.ts`, lines 93-115

The blocked keyword `"into"` (meant to block `INSERT INTO`) will also block any query mentioning a column or table named `into`, and more practically blocks `"lead into"`, `"grouped into"`, etc. in `COMMENT` or `LIKE` patterns. The word-boundary regex `\binto\b` will match the word in English prose.

More importantly, the defence relies on the application-level `chat_readonly` user having no `INSERT`/`UPDATE`/`DELETE` grants on the database. If that role is correctly set up the keyword blocklist is redundant; if it is not, the keyword list is insufficient (wrapping in CTEs, using `DO $$` blocks, etc. can bypass it). The blocklist gives false security.

**Fix:** Remove `"into"` from the forbidden list (the DB role is the real guard). Document that the DB role `chat_readonly` is the authoritative security boundary. Consider also blocking `pg_read_file`, `lo_export`, `copy` more robustly.

---

#### 4. HIGH — `proxy.ts` Duplicates `verifySession` Logic from `auth.ts`

**Files:** `src/proxy.ts` and `src/lib/auth.ts`

Two independent implementations of HMAC-SHA256 session verification. The middleware version uses `crypto.subtle` (Web Crypto) while `auth.ts` uses Node's `crypto` module. They must stay in sync; a bug fix in one is likely to be missed in the other.

**Fix:** Extract a shared verifier that works in both edge (middleware) and Node runtimes, or use a single source of truth by calling a shared utility.

---

#### 5. MEDIUM — `getCurrentUser()` Is React-`cache()`d But Called From API Routes

**File:** `src/lib/auth.ts`

React's `cache()` only deduplicates within a single React render tree. When called from Next.js API route handlers (`route.ts` files), which are not React renders, `cache()` has no effect and each call in a single HTTP request may produce separate DB queries.

**Fix:** For API routes, call `getSession()` once at the top and pass the `userId` down manually, or use a request-scoped cache (e.g., `AsyncLocalStorage`).

---

#### 6. MEDIUM — Entity Selection Is Only Captured at First Login; No Schema Enforcement

**File:** `src/app/api/auth/` and `src/components/VerifyForm.tsx`

The `users.entity` column is nullable and is set on first login via the verify flow. API routes that require an entity (e.g., `POST /api/survey-responses`) check `user.entity` at runtime and return a 400. However, nothing prevents a user from bypassing the entity-selection step (e.g., direct API calls after first token verification).

**Fix:** Consider making entity selection mandatory at the DB level (e.g., a `CHECK` constraint), or at least make the middleware redirect entity-less authenticated users to an entity-selection page.

---

#### 7. MEDIUM — Magic Token Cleanup Never Runs

**File:** `sql/auth_tables.sql`

Expired and used magic tokens accumulate in `magic_tokens` table indefinitely. There is no scheduled cleanup job, cron endpoint, or trigger to delete old tokens. Over time this table will grow without bound.

**Fix:** Add a periodic cleanup, either a cron API route that deletes `WHERE expires_at < NOW() - INTERVAL '1 day'`, or a PostgreSQL `pg_cron` job.

---

#### 8. MEDIUM — `auth_tables.sql` Still Has a `role` Column on `users` That Is Unused

**File:** `sql/auth_tables.sql`

The `users` table has a `role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'))` column, but role is now derived entirely from the `admin_emails` table via a LEFT JOIN in `getCurrentUser()`. The column in `users` is dead weight and its `CHECK` constraint can diverge from the `admin_emails` approach.

**Fix:** Migration to drop `users.role` column and update any references.

---

#### 9. MEDIUM — `SGReportsList.tsx` and `ReportSidebar.tsx` Are 65 KB and 75 KB Respectively

**Files:** `src/components/SGReportsList.tsx`, `src/components/ReportSidebar.tsx`

These are extremely large single-file components, making them hard to review, test, and maintain. `ReportSidebar.tsx` at 75 KB likely contains multiple distinct UI sections (survey form, sidebar info, entity badges, frequency display) that should be extracted.

**Fix:** Break each file into sub-components: `SurveyForm`, `ReportMetadata`, `SimilarReports`, etc.

---

#### 10. LOW — `README.md` Is the Boilerplate README, Not Project Documentation

**File:** `README.md`

The README describes the generic "UN Website Boilerplate" template and says nothing specific about this application: what it does, how to run the Python pipeline, what the DB_SCHEMA should be, or how to set up the `systemchart.entities` external schema dependency.

**Fix:** Replace with project-specific documentation (see PR B).

---

#### 11. LOW — `sql/reports_tables.sql` References `systemchart.entities` Without Documentation

**File:** `sql/reports_tables.sql`, lines for `report_entity_suggestions` and `report_entity_confirmations`.

```sql
entity TEXT NOT NULL REFERENCES systemchart.entities(entity),
```

This creates an FK dependency on a different schema (`systemchart`) that is not set up anywhere in this repository. A new developer cloning the repo and running the SQL will get a foreign key constraint error.

**Fix:** Document this external dependency. Either include a stub `systemchart.entities` table in the setup SQL or document clearly that this is a pre-existing shared schema on the target database.

---

#### 12. LOW — No Input Validation on Survey Response `mergeTargets` Array

**File:** `src/app/api/survey-responses/route.ts`

The `mergeTargets` field is stored as a `TEXT[]` without validation. Users can submit arbitrary strings. No check verifies these are valid document symbols. This could allow storing garbage data in the DB that would confuse downstream analysis.

**Fix:** Add a validation step that either checks symbols exist in `documents` or at minimum validates they match the UN document symbol pattern (e.g., `^[A-Z]/\d+/\d+`).

---

### Refactor Opportunities

1. **Centralise `DB_SCHEMA`**: Single import from `@/lib/config`, remove all local re-declarations.
2. **Extract SQL queries from page components**: `analysis/page.tsx` has 12 parallel DB queries inline — move to a `src/lib/queries/analysis.ts` module.
3. **Shared response helper**: `toPublicResponse()` in `survey-responses/route.ts` and similar transformers elsewhere should live in `src/lib/survey.ts`.
4. **Type-safe SQL results**: Replace bare `string` types for numeric DB columns (e.g., `count: string` from `COUNT(*)`) with a typed query helper or Zod schema.
5. **Python scripts**: The `pyproject.toml` defines dependencies but the scripts lack a unified entry point or CLI. Consider a `Makefile` or `justfile` documenting the pipeline order.

---

## Suggested Next Features

### 1. Response Reminder Emails
After the survey window opens, entities with confirmed reports but zero responses should receive weekly reminder emails. The email can include a direct link to the entity's dashboard pre-authenticated via a magic link. This increases completion rate without requiring manual admin follow-up.

**Implementation sketch:** A cron API route (`/api/cron/send-reminders`) that queries for entities with `confirmed_reports > 0 AND reports_with_response = 0`, looks up their users, and sends a personalised email via the existing `mail.ts` infrastructure. Rate-limit to once per week per user via a `reminder_sent_at` column.

---

### 2. Bulk Survey Response Import (Excel Upload)
Admins sometimes collect responses offline via spreadsheet before the system is set up. An Excel upload route (`/api/import/survey`) using `exceljs` (already a dependency) that accepts a structured template and upserts `survey_responses` rows would eliminate the need for manual DB inserts during onboarding.

**Implementation sketch:** Define a canonical Excel template, parse it server-side in a POST handler, validate each row, and upsert via the same logic as `POST /api/survey-responses`.

---

### 3. Response Conflict Detection and Flagging
When multiple users from the same entity submit conflicting recommendations (e.g., one says "continue annual", another says "discontinue"), the system currently shows both responses in the admin view without highlighting the conflict. A conflict-detection pass that flags `(proper_title, normalized_body, entity)` groups where `status` values disagree would help admins prioritize follow-up.

**Implementation sketch:** Add a `has_conflict` computed column in the analysis query or a `conflict_flag` view. Surface conflicts as a warning badge in the entity progress table.

---

### 4. Deadline and Progress Notifications
Admins need to communicate survey deadlines to entities. A configurable survey deadline stored in a `survey_config` table, displayed to users as a countdown banner on their dashboard, and triggering escalation emails ("3 days left") would improve participation rates.

**Implementation sketch:** A minimal `survey_config` table with a `deadline TIMESTAMPTZ` column, a GET endpoint, and a banner component in `EntityDashboard.tsx` that shows a countdown if the deadline is within 7 days.

---

### 5. Report Detail Page with Full Timeline
Currently there is no permalink for a specific report series. Adding a `/reports/[symbol]` (or `/reports/[properTitle]` slug) page showing the full publication history, mandating resolutions, all entity responses (anonymized for non-admins), and AI-generated summary would give survey participants context before answering. The data is already in the DB — this is purely a UI gap.

**Implementation sketch:** Catch-all route `src/app/reports/[...slug]/page.tsx` that queries `documents` by `proper_title`, joins `report_frequencies`, `report_entity_suggestions`, and `based_on_resolution_symbols`. The similar-reports API already powers the sidebar in `ReportSidebar.tsx`; most of the data-fetching code can be reused.

---

### 6. Vector Search / Semantic Report Discovery
The embeddings are already generated (python/03) and stored. The `/api/similar-reports` endpoint exists. However, there is no search UI that lets users search by semantic meaning (e.g., "find all reports about climate finance"). Adding a semantic search bar on `/reports` that calls the similarity endpoint would unlock the full value of the embedding infrastructure.

**Implementation sketch:** A search input on `SGReportsList.tsx` that, when submitted, calls `/api/similar-reports?query=...` with the text query (the API would embed the text client-side or server-side and return top-k results by cosine distance).

---

### 7. Mandate Expiry Tracker
Resolutions mandating SG reports sometimes include sunset clauses or refer to a specific session. Cross-referencing `based_on_resolution_symbols` with `resolution_mandates.explicit_frequency` and resolution dates would let the system flag reports whose mandate may have expired or is from a very old resolution. This helps users make better "continue vs discontinue" decisions.

**Implementation sketch:** A computed column or view that joins `report_frequencies` with `sg_report_mandates` and `resolution_mandates` to identify reports where the most recent mandating resolution is older than X years and no explicit renewal is found.
