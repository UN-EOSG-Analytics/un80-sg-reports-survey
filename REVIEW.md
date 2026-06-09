# Code Review: UN80 SG Reports Survey

## What This Project Does

This is a **Secretary-General Reports Survey** web application for the United Nations Executive Office of the Secretary-General (EOSG). It solves a concrete coordination problem: the UN Secretariat regularly produces hundreds of reports to Member States through different UN bodies (General Assembly, Security Council, ECOSOC, Human Rights Council). Every few years these get reviewed — which ones should continue, merge, change frequency, or be discontinued?

The app gathers that structured feedback from the responsible UN entities (UNDP, UNICEF, WHO, etc.) in a systematic, trackable way.

### User Journey

1. A UN staff member logs in with their `@un.org` (or partner domain) email via **magic-link authentication**.
2. On first login they pick their entity (UNDP, WHO, UNICEF, etc.).
3. They see a dashboard of Secretary-General reports AI-suggested as belonging to their entity — filtered to 2023-present.
4. They **confirm** (or reject) which reports are theirs, then fill in a **survey** for each: continue / continue-with-changes / merge / discontinue — with optional frequency, format, and freetext comments.
5. Admins see an **analysis page** with coverage stats, response breakdowns, and per-entity progress tables they can export to Excel.
6. An embedded **AI chat assistant** (Azure OpenAI GPT-5) lets any logged-in user ask natural-language questions about the report corpus, query the database, and read full document text.

### Data Pipeline (Python)

A numbered Python pipeline populates the database offline:
- **01** — Fetches SG report metadata from the UN Digital Library API, extracts PDF text, stores in `documents` table.
- **02** — Populates `reporting_entities` from DGACM and DRI source files.
- **03** — Generates 1024-dimensional OpenAI embeddings for vector search.
- **04** — Uses GPT to extract mandate info (frequency requirements, verbatim paragraphs) from resolutions.
- **05** — Uses AI to suggest which entities own which reports.
- **06** — Calculates historical publication frequencies per report series.

---

## Architecture Overview

### Stack

| Layer | Technology |
|---|---|
| Frontend / Backend | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | PostgreSQL (Azure) with pgvector extension |
| Auth | Custom magic-link (HMAC-SHA256 session cookies, 30-day expiry) |
| AI / Chat | Azure OpenAI GPT-5 via SSE streaming, agentic tool loop |
| Emails | Nodemailer |
| Data Pipeline | Python (pandas, psycopg2, OpenAI, PyMuPDF) |
| Package Manager | pnpm |

### Database Schema

All tables live in the `sg_reports_survey` schema (configurable via `DB_SCHEMA` env var). A separate `systemchart` schema is assumed to contain a canonical `entities` table.

```
authentication/
  users               -- email, entity, last_login_at
  magic_tokens        -- TOTP-style tokens (15 min TTL)
  allowed_domains     -- per-entity email domain whitelist
  admin_emails        -- explicit admin whitelist

documents/
  documents           -- all UN documents (reports + resolutions), 1024-dim embeddings
  report_entity_suggestions    -- AI/DGACM/DRI suggestions mapping reports→entities
  report_entity_confirmations  -- user-confirmed entity ownership (lead/contributing)
  report_frequencies           -- calculated historical frequencies per report series
  report_frequency_confirmations -- one-time report confirmations (skip survey)
  survey_responses             -- the core survey data (continue/merge/discontinue)
  ai_chat_logs                 -- interaction logging for evaluation

views/
  sg_reports         -- filtered view: SG reports 2023+
  resolutions        -- resolution documents
  sg_report_mandates -- join: reports ↔ mandating resolutions
  sg_reports_stats   -- counts by source
  report_entities    -- aggregated suggestions + confirmations per series
  latest_versions    -- most recent version per (title, UN body) pair
```

### API Routes

| Route | Purpose |
|---|---|
| `POST /api/auth/send-magic-link` | Send login email |
| `POST /api/auth/verify` | Verify token, create session |
| `GET /api/entities` | Fetch entity list |
| `GET /api/sg-reports` | Paginated list for reports browser |
| `GET /api/reports` | Entity-scoped report list |
| `GET /api/similar-reports` | Vector similarity search |
| `GET/POST/DELETE /api/survey-responses` | CRUD survey responses |
| `GET /api/survey-responses/my-responses` | Current user's responses |
| `POST /api/entity-confirmations` | Confirm entity ownership |
| `GET /api/entity-suggestions` | AI suggestions for entity |
| `GET /api/frequency-confirmations` | One-time confirmations |
| `GET /api/export/survey` | Admin: export survey to Excel |
| `GET /api/export/entities` | Admin: export entity progress |
| `POST /api/chat` | AI chat (SSE streaming) |
| `GET /api/stats` | Aggregate stats |

### Key Components

- `SGReportsList.tsx` (~65 KB) — the main report browser table with filters, sorting, inline survey form, entity badges, sidebar
- `ReportSidebar.tsx` (~74 KB) — detail sidebar with full report metadata, versions, mandates, similar reports, and the survey form
- `Treemap.tsx` — D3-style treemap visualization (pure SVG, no D3 dependency)
- `EntityDashboard.tsx` — entity-specific dashboard shown on home page
- `EntityBadges.tsx`, `FrequencyBadge.tsx`, `DocumentSymbolBadge.tsx` — shared display components

---

## Code Quality Findings

### Issues — High Priority

**1. SQL injection risk via string interpolation of `DB_SCHEMA`**

`analysis/page.tsx` reads `DB_SCHEMA` directly from `process.env` and inlines it into SQL:
```ts
// analysis/page.tsx
const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";
// then:
query<...>(`SELECT ... FROM ${DB_SCHEMA}.report_frequencies`)
```
This duplicates the pattern already solved in `src/lib/config.ts` (which exports the `tables` object) and creates a divergence risk. If `DB_SCHEMA` ever contained special characters it would be injectable. More importantly, the `analysis/page.tsx` module maintains its own local `DB_SCHEMA` constant that ignores `lib/config.ts`. **Fix: import `DB_SCHEMA` from `lib/config.ts` or use the view/function helpers — don't re-read env in pages.**

**2. `readDocument` tool queries without schema prefix**

In `chat-tools.ts`, `readDocument()` issues:
```ts
SELECT ... FROM documents WHERE symbol = $1
```
This relies entirely on `SET search_path` being applied by the `query()` helper. The `chatQuery()` helper (used for `query_database`) uses a different connection pool (`db-chat.ts`) where `search_path` may differ. This is a silent correctness risk: if the chat_readonly user connects without `search_path` set, the query falls through to `public.documents` (which doesn't exist) or fails silently.

**3. `frequency_confirmations_table.sql` uses `DROP TABLE IF EXISTS`**

The table-creation file for `report_frequency_confirmations` starts with:
```sql
DROP TABLE IF EXISTS sg_reports_survey.report_frequency_confirmations;
```
This is a destructive operation in a file that looks like a schema definition. Dropping in production would delete all user confirmations. It should be replaced with a proper migration that uses `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

**4. TODO items noted in `docs/TODO.md` are live bugs**

- The dashboard survey column in `SGReportsList.tsx` reads only `my-responses` for survey completion tracking, so one-time confirmed reports still show "Go to survey" incorrectly.
- Multi-entity edge case: if two entities are assigned the same report and both confirm it as `one-time`, only the last confirmer gets credit (schema `UNIQUE (proper_title, normalized_body)` in `report_frequency_confirmations`).

**5. The `analysis/page.tsx` `getAnalysisData()` function fires 12 parallel DB queries**

All 12 queries run with `Promise.all()` in a single request, which is fine for correctness but could saturate the pool (max 20 connections) during concurrent admin access. Consider caching the analysis data for short TTLs (30–60 seconds) with `unstable_cache` or React's `cache()`.

### Issues — Medium Priority

**6. `SGReportsList.tsx` and `ReportSidebar.tsx` are extremely large single files (65 KB and 74 KB)**

Both components pack all logic, all sub-views, and all inline types into one file. This makes diffs large, test coverage impossible without a DOM, and collaboration difficult. Each should be split into feature sub-components (e.g., `ReportSidebar/SurveyForm.tsx`, `ReportSidebar/VersionHistory.tsx`).

**7. No input validation on survey response `POST`**

The `frequency`, `format`, and `comments` fields are passed straight to SQL with only a status-based `null`-out guard. There is no length limit on `comments`, and `frequency` / `format` values are not validated against the allowed enum values before insert (the `CHECK` constraint on the DB catches it, but the API returns a raw 500 error rather than a meaningful 400 with a clear message).

**8. `isQuerySafe()` in `chat-tools.ts` blocks `pg_` prefix but permits `information_schema`**

The SQL safety filter blocks `pg_*` system tables but does not block `information_schema`, which would let the AI (or a user crafting a chat prompt) enumerate all table and column names. The database role (`chat_readonly`) presumably handles this via grants, but the defence-in-depth check is missing.

**9. README.md is the boilerplate, not the project README**

The current README describes the generic UN website boilerplate template, not this specific survey application. It includes setup instructions for renaming the schema, which has already been done. Anyone arriving at the repository cold has no idea what the application does.

**10. No test suite**

There are zero tests. The `scripts/test-chat.ts` script is an integration smoke-test against a live API, not a unit test. Pure utility functions — `isQuerySafe()`, `normalizeBodyKey()`, `verifySession()`, `slugify`-style helpers, `clean_metadata` in Python — are all untested.

**11. `views.sql` silently re-grants only to `chat_readonly`**

The view re-grant block only covers `sg_reports` and `latest_versions`. Any other view added later (or the `report_entities` view used in the analysis page query) would require a manual grant. This is easy to miss.

### Issues — Low Priority

**12. `data/INFO` file is empty / opaque**

The `data/` directory contains only an `INFO` file (89 bytes). It should explain what data files are expected and where they come from.

**13. `results/` contains large committed JSON test outputs (~1 MB total)**

Six chat test result JSON files (each 40–430 KB) are committed to the repo. These are development artifacts and should be gitignored.

**14. Python scripts lack a `requirements.txt` / setup instructions**

Dependencies are in `pyproject.toml` and `uv.lock`, but there is no README section explaining how to run the Python pipeline steps, what order to run them in, or what `.env` variables they require.

---

## Feature Suggestions

Ranked by estimated impact / effort ratio.

### 1. Completion progress email digests (High Impact / Low Effort)

A weekly admin email summarising coverage %, entities not yet started, and number of remaining reports. Nodemailer is already wired in. This removes the need for admins to manually check the analysis page.

### 2. Entity-to-entity report transfer / reassignment UI (High Impact / Medium Effort)

Currently if an entity was incorrectly suggested a report, admins must go to the database directly to fix the suggestion. An admin UI to reassign reports between entities (updating `report_entity_confirmations`) would unblock the survey for misassigned reports.

### 3. Mandate change detection alert (High Impact / Medium Effort)

When a new resolution changes the mandate for a report (different frequency, new body, discontinued), surface an alert badge in the report sidebar. The `resolution_mandates` table and `based_on_resolution_symbols` are already populated. A nightly job could diff new vs old mandate paragraphs and flag deltas.

### 4. Aggregate response view per report for non-admins (Medium Impact / Low Effort)

Currently only admins see all responses for a given report. Non-admin users can only see their own. Showing anonymised aggregate breakdowns (e.g., "3 entities responded: 2 Continue, 1 Discontinue") within the sidebar would encourage participation and reduce duplicated effort across entities.

### 5. Survey deadline / reminder tracker (Medium Impact / Low Effort)

A configurable survey deadline date (stored as an env var or DB config row) that drives a countdown banner on the dashboard and auto-flags overdue entities on the analysis page. Currently there is no sense of urgency in the UI.

### 6. Bulk survey export to PowerPoint / Word (Medium Impact / Medium Effort)

The Excel export covers raw data. A presentation-ready summary (entity-by-entity, report by report, showing distribution of continue/discontinue/merge) would be directly usable for the SG's review meeting. The `docx` library used in the morning-briefings project (same UN EOSG org) is already proven.

### 7. Semantic duplicate detection in the reports browser (Medium Impact / Medium Effort)

The vector embeddings are generated but only surface in the AI chat tool. A "Potentially similar reports" section in the sidebar (populated via the existing `/api/similar-reports` endpoint) would prompt entities to recommend merging pairs rather than discovering the similarity post-hoc.

### 8. AI-assisted pre-fill of survey responses (Medium Impact / Medium Effort)

For each report, the AI could propose a draft response (continue / discontinue / change frequency) based on the resolution mandate's stated frequency, the report's actual frequency, and the entity's historical pattern. The user would then confirm or override. Reduces friction for entities with many reports.

### 9. Read-only public summary page (Low Impact / Low Effort)

There is already a `public-page` branch in the repo. A public-facing page showing aggregate statistics (total reports reviewed, overall continue/discontinue split, breakdown by UN body) would provide transparency and be shareable with Member States.

### 10. Python pipeline progress dashboard (Low Impact / Medium Effort)

A simple admin sub-page showing which pipeline steps have run (document count, embedding coverage %, entity suggestion coverage %, date of last run) would give operators situational awareness without needing to shell into the server.

---

## Prioritised Issue List

| # | Priority | Issue | File |
|---|---|---|---|
| 1 | High | `DB_SCHEMA` re-read from env in `analysis/page.tsx` instead of `lib/config.ts` | `src/app/analysis/page.tsx` |
| 2 | High | `readDocument` queries without schema-qualified table name | `src/lib/chat-tools.ts` |
| 3 | High | `DROP TABLE` in schema file is destructive in production | `sql/frequency_confirmations_table.sql` |
| 4 | High | TODO bugs: survey badge wrong for one-time reports; multi-entity confirmation collision | `src/components/SGReportsList.tsx`, `docs/TODO.md` |
| 5 | Medium | 12 parallel DB queries on analysis page — add short-TTL cache | `src/app/analysis/page.tsx` |
| 6 | Medium | `SGReportsList.tsx` and `ReportSidebar.tsx` need splitting | `src/components/` |
| 7 | Medium | No validation of `frequency`/`format` enum values in survey POST | `src/app/api/survey-responses/route.ts` |
| 8 | Medium | `information_schema` not blocked in `isQuerySafe()` | `src/lib/chat-tools.ts` |
| 9 | Medium | README is boilerplate, not project-specific | `README.md` |
| 10 | Medium | No unit tests | — |
| 11 | Low | `views.sql` re-grants are incomplete | `sql/views.sql` |
| 12 | Low | `results/` JSON test files should be gitignored | `.gitignore` |
| 13 | Low | Python pipeline has no setup / run documentation | `python/` |
