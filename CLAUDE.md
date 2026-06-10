# CLAUDE.md

Agent instructions for working with this codebase.

## Think before coding

Before implementing: state your assumptions explicitly, surface tradeoffs, and ask if something is unclear. For trivial tasks use judgment; for anything touching auth, survey data, or the AI chat pipeline, read the relevant files first.

## Project Overview

**UN SG Reports Survey** is a Next.js 16 internal web app for the UN EOSG (Executive Office of the Secretary-General). UN entities log in via magic link, review Secretary-General reports assigned to them, and submit structured survey responses on each report's frequency and disposition.

## Commands

```bash
pnpm dev          # Dev server → http://localhost:3000
pnpm build        # Production build
pnpm lint         # ESLint
pnpm typecheck    # TypeScript (no emit)
```

Package manager: **pnpm**. Do not use npm or yarn.

No test suite exists. `scripts/test-chat.ts` is a live integration smoke test (needs DB + API keys).

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** with `@import "tailwindcss"` in globals.css
- **shadcn/ui** components in `src/components/ui/`
- **PostgreSQL** via `pg` (raw SQL, no ORM) — all tables in the `sg_reports_survey` schema
- **pgvector** extension — `documents.embedding` is `vector(1024)` for semantic search
- **Azure OpenAI** (GPT-4o) — chat agent with tool calls
- **Nodemailer** — magic link emails

## Environment Variables

Required in `.env.local`:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `DB_SCHEMA` | Schema name (default: `sg_reports_survey`) |
| `AUTH_SECRET` | HMAC secret for session cookies (`openssl rand -hex 32`). Falls back to a dev default — **must** be set in production. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Outbound email for magic links |
| `BASE_URL` | App URL used in magic link emails |
| `AZURE_OPENAI_API_KEY` | Chat agent |
| `AZURE_OPENAI_ENDPOINT` | Chat agent |
| `AZURE_OPENAI_DEPLOYMENT` | Chat model deployment name (e.g. `gpt-4o`) |
| `CHAT_READONLY_DATABASE_URL` | Restricted DB connection for `query_database` tool (chat_readonly role) |

## Architecture

### Auth (magic link)

1. User enters email on `/login`; rate-limited (2-min cooldown per email).
2. 32-byte hex token stored in `magic_tokens` (15-min expiry) and emailed.
3. `/verify?token=…` atomically marks token `used_at` — replay-proof.
4. Session cookie: self-contained base64+HMAC JWT, 30-day expiry.
5. `getCurrentUser()` in `src/lib/auth.ts` is `React.cache`-wrapped — DB hit once per request.
6. Admin role: derived from `admin_emails` table (not stored in session), takes effect immediately.

**Key files:** `src/lib/auth.ts`, `src/lib/actions.ts`, `src/middleware.ts`, `src/app/login/`, `src/app/verify/`

### Survey Data Model

- `report_entity_suggestions` — AI/DGACM/DRI suggestions mapping a report to an entity.
- `report_entity_confirmations` — user confirmation that a report belongs to their entity (unique per `(proper_title, entity)`).
- `report_frequency_confirmations` — entity-confirmed publication frequency. **Note:** currently unique on `(proper_title)` only — see Known Issues.
- `survey_responses` — structured feedback per `(proper_title, normalized_body, responded_by_user_id)`.

### DB Schema Conventions

The schema name comes from `DB_SCHEMA` env var. The helper in `src/lib/config.ts` exports prefixed table names for **auth tables** only. App tables (documents, survey_responses, etc.) currently hardcode the schema directly in each route as:

```ts
const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";
```

This is a known inconsistency — prefer extending `src/lib/config.ts` for new tables.

All SQL uses parameterized queries (`$1`, `$2`, …) via `query()` in `src/lib/db.ts`. The pool sets `search_path` to `${dbSchema}, public` (needed for pgvector operators).

### Key Tables

| Table | Purpose |
|---|---|
| `users` | Auth users — email, entity, last_login_at |
| `magic_tokens` | Passwordless login tokens |
| `allowed_domains` | Email domain allowlist (entity-scoped or `*` for global) |
| `admin_emails` | Admin email list (role derivation) |
| `documents` | UN document records with full text + `vector(1024)` embedding |
| `report_entity_suggestions` | System/AI entity assignment suggestions |
| `report_entity_confirmations` | User-confirmed entity ownership |
| `report_frequency_confirmations` | User-confirmed publication frequency |
| `survey_responses` | Structured survey submissions |
| `report_frequencies` | Computed frequency from publication gap history |
| `ai_chat_logs` | Full AI chat interaction log |

### AI Chat (`query_database` tool — HIGH RISK)

The chat agent can call `query_database` to run SQL. Safeguards:

1. **Keyword blocklist** in `src/lib/chat-tools.ts` (`isQuerySafe`) — blocks `INSERT`, `UPDATE`, `DELETE`, `DROP`, etc. and forbidden tables (`users`, `magic_tokens`, `ai_chat_logs`).
2. **Automatic `LIMIT 100`** appended if not present.
3. **`chat_readonly` DB role** (`sql/create_chat_user.sql`) — the real enforcement layer. This role must have `SELECT` only on non-sensitive tables. The keyword blocklist is defense-in-depth, not the primary control.

**Before touching chat tools:** audit that `CHAT_READONLY_DATABASE_URL` uses the minimal-privilege role. Do not add new sensitive tables to the schema without also blocking them in `FORBIDDEN_TABLES`.

### Python Pipeline (run before app data is usable)

Scripts in `python/` populate the database from UN Digital Library sources. Run in order:

```bash
uv run python python/01_get_reports.py          # Scrape → documents table
uv run python python/02_populate_reporting_entities.py  # Seed entity suggestions
uv run python python/03_generate_embeddings.py  # Generate vector embeddings
uv run python python/04_extract_mandate_info.py # Link reports to mandate resolutions
uv run python python/05_ai_entity_suggestions.py # AI entity matching
uv run python python/06_calculate_frequencies.py # Compute publication frequencies
```

Scripts are idempotent — safe to re-run after data updates.

## Key Files to Read Before Working on Each Subsystem

| Subsystem | Read first |
|---|---|
| Auth | `src/lib/auth.ts`, `src/lib/config.ts`, `sql/auth_tables.sql` |
| Survey workflow | `src/components/SGReportsList.tsx`, `src/components/ReportSidebar.tsx`, `src/app/api/survey-responses/route.ts` |
| Dashboard | `src/app/page.tsx`, `src/components/EntityDashboard.tsx` |
| AI chat | `src/app/api/chat/route.ts`, `src/lib/chat-tools.ts`, `sql/create_chat_user.sql` |
| Data model | `sql/reports_tables.sql`, `sql/survey_responses_table.sql`, `sql/frequency_confirmations_table.sql` |
| Python pipeline | `python/` scripts (in order), `pyproject.toml` |

## Known Issues

See `docs/TODO.md` for the current bug list:

1. **Survey column reads wrong source** — `SGReportsList.tsx` fetches `/api/survey-responses/my-responses` (current user only) instead of entity-level responses for the "Survey" column. Reports completed by a colleague appear incomplete.
2. **One-time reports show "Go to survey" badge** — confirmed one-time reports don't need a full survey response, but the badge logic ignores `confirmedFrequency`.
3. **Multi-entity one-time confirmation edge case** — `report_frequency_confirmations` lacks a per-entity column, so two entities confirming the same report as one-time will overwrite each other. Schema migration required to fix properly.

## Migrations

Do NOT run migrations unless the user explicitly asks. Write the SQL and hand the `psql` command to the user. Schema migrations go in `sql/migrations/` (or directly in the relevant `sql/*.sql` file for a fresh install).
