# UN80 SG Reports Survey

A web application for the UN-EOSG Analytics team to manage the UN80 review of Secretary-General mandatory reports. UN system staff review reports assigned to their entity, submit survey responses, and confirm entity assignments. Admins view aggregated analysis and export data.

## Features

- **Magic-link authentication** — passwordless login; allowed email domains configured in database
- **Admin whitelist** — admin privileges granted via `admin_emails` DB table (separate from user accounts)
- **Entity dashboard** — each user sees reports suggested for their entity; they confirm the list and submit survey responses
- **Survey responses** — per-user, per-report responses: continue / merge / discontinue, with frequency and format preferences
- **Entity confirmation** — users confirm or adjust AI/DGACM/DRI-suggested entity assignments
- **Analysis page** (`/analysis`, admin only) — coverage metrics, per-entity progress, frequency-direction breakdown
- **Excel export** — survey responses and entity confirmations (`/api/export/survey`); entity progress table (`/api/export/entities`, admin only)
- **AI chat** — OpenAI-powered RAG chat over the reports database
- **Python data pipeline** — scrapes UN Digital Library, generates embeddings, calculates historical frequencies

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.template .env.local
```

Required variables in `.env.local`:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `DB_SCHEMA` | Schema name (e.g. `sg_reports_survey`) |
| `AUTH_SECRET` | HMAC secret — generate with `openssl rand -hex 32` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Mail server for magic links |
| `SMTP_FROM` | Sender address (falls back to `SMTP_USER`) |
| `BASE_URL` | Public app URL (for magic link emails, optional if behind a proxy) |
| `OPENAI_API_KEY` | OpenAI API key (for AI chat) |

### 3. Set up the database

Apply the SQL files **in this order**:

```bash
# Auth tables (users, magic_tokens, allowed_domains)
psql $DATABASE_URL -f sql/auth_tables.sql

# Application tables (documents, survey_responses, etc.)
psql $DATABASE_URL -f sql/reports_tables.sql
psql $DATABASE_URL -f sql/survey_responses_table.sql
psql $DATABASE_URL -f sql/frequency_confirmations_table.sql
psql $DATABASE_URL -f sql/report_frequencies_table.sql

# Migrations (apply in order)
psql $DATABASE_URL -f sql/migrations/002_add_normalized_body.sql
psql $DATABASE_URL -f sql/migrations/003_add_entity_role.sql
psql $DATABASE_URL -f sql/migrations/004_manual_reports_migration.sql
psql $DATABASE_URL -f sql/migrations/005_multi_user_responses_and_admin_role.sql
psql $DATABASE_URL -f sql/migrations/006_drop_response_email_audit_columns.sql
psql $DATABASE_URL -f sql/migrations/007_admin_emails_whitelist.sql
psql $DATABASE_URL -f sql/migrations/008_fix_frequency_check_constraint.sql

# Views
psql $DATABASE_URL -f sql/views.sql
```

To grant an admin:
```sql
INSERT INTO sg_reports_survey.admin_emails (email) VALUES ('name@un.org');
```

### 4. Run

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Python Data Pipeline

The `python/` directory contains numbered scripts that populate the database:

| Script | What it does |
|---|---|
| `01_get_reports.py` | Scrapes UN Digital Library, downloads document metadata |
| `02_populate_reporting_entities.py` | Matches documents to UN entities (DGACM + DRI sources) |
| `03_generate_embeddings.py` | Generates OpenAI embeddings for semantic search |
| `04_extract_mandate_info.py` | Extracts mandate details from PDF documents |
| `05_ai_entity_suggestions.py` | AI-assisted entity matching |
| `06_calculate_frequencies.py` | Computes historical reporting frequencies |

Run scripts in order. Each script loads `.env` via `python-dotenv`. Required env vars: `DATABASE_URL`, `DB_SCHEMA`, `OPENAI_API_KEY`.

```bash
uv run python python/01_get_reports.py
# ... etc.
```

## Commands

```bash
pnpm dev          # Dev server → http://localhost:3000
pnpm build        # Production build
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check (no emit)
pnpm format       # Prettier
```

## File Structure

```
src/
├── app/
│   ├── about/              # Public landing page
│   ├── analysis/           # Admin analysis page (coverage, entity progress)
│   ├── api/
│   │   ├── auth/            # Auth API routes (request, verify, logout)
│   │   ├── chat/            # AI chat (OpenAI RAG)
│   │   ├── documents/       # Document search
│   │   ├── entities/        # Entity list
│   │   ├── entity-confirmations/  # Entity assignment confirmations
│   │   ├── entity-suggestions/    # AI entity suggestions
│   │   ├── export/          # Excel export (survey + entities)
│   │   ├── frequency-confirmations/ # One-time report confirmations
│   │   ├── reports/         # Report data
│   │   ├── sg-reports/      # SG-specific report queries
│   │   ├── similar-reports/ # Embedding-based similarity
│   │   ├── stats/           # Survey statistics
│   │   └── survey-responses/ # Survey response CRUD
│   ├── login/              # Login page
│   ├── reports/            # Browse all reports (public)
│   ├── stats/              # Stats page
│   ├── verify/             # Token verification + entity selection
│   └── page.tsx            # Protected dashboard
├── components/
│   ├── EntityDashboard.tsx  # Main entity view
│   ├── SGReportsList.tsx    # Report list with survey UI
│   ├── ReportSidebar.tsx    # Report detail sidebar
│   ├── SurveyExportButton.tsx
│   ├── EntityTableExport.tsx
│   └── ui/                  # shadcn/ui primitives
├── lib/
│   ├── actions.ts           # Server actions (login, verify, logout)
│   ├── auth.ts              # Auth logic (sessions, tokens, getCurrentUser)
│   ├── config.ts            # DB_SCHEMA config + table names
│   ├── db.ts                # PostgreSQL pool
│   ├── get-base-url.ts      # Dynamic host detection
│   └── mail.ts              # Magic link emails
└── proxy.ts               # Next.js middleware (route protection)
python/                    # Data pipeline scripts
sql/                       # Database schema and migrations
  ├── auth_tables.sql
  ├── reports_tables.sql
  ├── survey_responses_table.sql
  ├── views.sql
  └── migrations/          # Incremental migrations (apply in order)
docs/                      # Analysis docs and notes
```

## Auth Flow

1. User visits `/about` (public landing page)
2. User clicks “Sign In” → `/login`
3. User enters email; magic link sent (rate-limited: 2-minute cooldown)
4. User clicks link → `/verify?token=...`
5. First login: select entity; returning users: sign in directly
6. Session cookie set (30 days, HMAC-signed)
7. Unauthenticated users accessing protected routes → redirect to `/about`

Admin access: add email to `admin_emails` table directly in the database.

## Maintenance

```bash
pnpm audit          # Security vulnerabilities
pnpm outdated       # Outdated packages
pnpm lint           # ESLint
pnpm typecheck      # TypeScript errors
```

## Adding shadcn/ui components

```bash
npx shadcn@latest add <component-name>
```
