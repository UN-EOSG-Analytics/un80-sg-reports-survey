# UN SG Reports Survey

A web application for UN entities to review Secretary-General reports and submit structured recommendations (continue, merge, or discontinue) ahead of the UN80 review process.

Built on Next.js 16 with React 19, PostgreSQL + pgvector, and Azure OpenAI.

## What It Does

- UN entity representatives (UNDP, WHO, UNICEF, etc.) log in with their institutional email
- Each user selects their entity and sees a curated list of SG reports assigned to that entity
- For each report they submit a structured survey: **continue** (as-is or with new frequency/format), **merge** (with another series), or **discontinue**
- Admins see a live analytics dashboard with coverage stats, response breakdowns, and per-entity progress
- An AI assistant (Azure OpenAI, agentic with tool use) lets users explore report content, mandates, and similarities
- All data exports to Excel for offline analysis

## Prerequisites

- Node.js 20+ and pnpm
- Python 3.12+ and `uv` (for the data ingestion pipeline)
- PostgreSQL 15+ with the `pgvector` extension enabled
- A `systemchart` schema on the same database with an `entities` table (pre-existing UN org chart table; required for FK constraints)
- Azure OpenAI credentials (for the AI chatbot)

## Quick Start

```bash
# 1. Install Node dependencies
pnpm install

# 2. Copy environment template
cp .env.template .env.local
# Edit .env.local — minimum required vars:
#   DATABASE_URL
#   DB_SCHEMA=sg_reports_survey
#   AUTH_SECRET  (openssl rand -hex 32)
#   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / BASE_URL
#   AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY / AZURE_OPENAI_API_VERSION / AZURE_OPENAI_DEPLOYMENT

# 3. Create database tables (in order)
psql $DATABASE_URL -f sql/auth_tables.sql
psql $DATABASE_URL -f sql/reports_tables.sql
psql $DATABASE_URL -f sql/survey_responses_table.sql
psql $DATABASE_URL -f sql/report_frequencies_table.sql
psql $DATABASE_URL -f sql/frequency_confirmations_table.sql
psql $DATABASE_URL -f sql/views.sql

# 4. (Optional) Create read-only chat user
psql $DATABASE_URL -f sql/create_chat_user.sql

# 5. Run the data ingestion pipeline (Python)
uv sync
uv run python/01_get_reports.py       # Import documents from UN library
uv run python/02_populate_reporting_entities.py  # Map reports → entities
uv run python/03_generate_embeddings.py  # Generate 1024-dim embeddings
uv run python/04_extract_mandate_info.py # Extract mandate paragraphs
uv run python/05_ai_entity_suggestions.py # AI entity suggestions
uv run python/06_calculate_frequencies.py # Compute reporting frequencies

# 6. Start the dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DB_SCHEMA` | Yes | Schema name — use `sg_reports_survey` |
| `AUTH_SECRET` | Yes | 32-byte hex secret for session HMAC |
| `BASE_URL` | Yes | App URL for magic-link emails |
| `SMTP_HOST` | Yes | SMTP server hostname |
| `SMTP_PORT` | Yes | SMTP port (587 or 465) |
| `SMTP_USER` | Yes | SMTP username / from address |
| `SMTP_PASS` | Yes | SMTP password |
| `AZURE_OPENAI_ENDPOINT` | Yes (chat) | Azure AI Foundry endpoint |
| `AZURE_OPENAI_API_KEY` | Yes (chat) | Azure AI API key |
| `AZURE_OPENAI_API_VERSION` | Yes (chat) | API version (e.g. `2024-05-01-preview`) |
| `AZURE_OPENAI_DEPLOYMENT` | Yes (chat) | Deployment name (e.g. `gpt-5`) |

## Development Commands

```bash
pnpm dev          # Dev server → http://localhost:3000
pnpm build        # Production build
pnpm typecheck    # TypeScript type-check (no emit)
pnpm lint         # ESLint
pnpm format       # Prettier
pnpm test         # Unit tests (vitest)
```

## Database Schema

All tables live in the `sg_reports_survey` schema. The application also reads from a `systemchart` schema (pre-existing; not managed here) for the canonical entity list.

| Table / View | Purpose |
|---|---|
| `users` | Registered users (email, entity) |
| `magic_tokens` | Passwordless login tokens |
| `allowed_domains` | Permitted email domains per entity |
| `admin_emails` | Emails with admin access |
| `documents` | All UN documents with full text and 1024-dim embeddings |
| `report_entity_suggestions` | AI/DGACM/DRI suggestions mapping reports → entities |
| `report_entity_confirmations` | User-confirmed report-entity assignments |
| `report_frequencies` | Pre-computed publication frequency per report series |
| `survey_responses` | User survey submissions |
| `report_frequency_confirmations` | "This is a one-time report" confirmations |
| `ai_chat_logs` | Chat session log for evaluation |
| `sg_reports` (view) | Filtered SG reports 2023+ |
| `latest_versions` (view) | Most recent document per series per body |
| `report_entities` (view) | Combined suggestions + confirmations per series |
| `sg_report_mandates` (view) | Reports joined with their mandating resolutions |

## Architecture

```
python/           ← Offline data ingestion (run by admins before launch)
sql/              ← Database schema, views, migrations
src/
  app/
    page.tsx                     — Entity dashboard (protected)
    about/                       — Public landing page
    reports/                     — Browse all SG reports
    analysis/                    — Admin analytics dashboard
    stats/                       — Treemap visualization
    api/
      chat/                      — AI assistant (SSE, agentic)
      survey-responses/          — Survey CRUD
      export/survey/             — Excel export (admin only)
      export/entities/           — Entity progress export
      similar-reports/           — Vector similarity search
      frequency-confirmations/   — One-time report confirmations
  components/
    SGReportsList.tsx            — Main survey interface
    ReportSidebar.tsx            — Report detail + survey form
    EntityDashboard.tsx          — User-facing dashboard
    Treemap.tsx                  — D3-style treemap chart
  lib/
    auth.ts                      — Session signing, magic links
    config.ts                    — DB_SCHEMA + table names
    db.ts                        — pg connection pool
    chat-tools.ts                — AI tool implementations
```

## Auth Flow

1. User visits `/about` → clicks "Sign In" → `/login`
2. Enters institutional email → magic link sent (2-minute rate limit)
3. Clicks link → `/verify?token=...`
4. First login: selects entity from UN org chart dropdown
5. Session cookie set (30-day HMAC-signed JWT, httpOnly)
6. Header shows email + entity badge (clickable to change entity)

## Running Tests

```bash
pnpm test
```

Unit tests cover auth helpers and the SQL safety checker. Integration tests (requiring a live DB) are in `src/**/__integration__/` and are excluded by default.

## Data Pipeline

The Python scripts in `python/` are numbered and should be run in order. Each script is idempotent — re-running it updates existing rows rather than duplicating them.

| Script | Input | Output |
|---|---|---|
| `01_get_reports.py` | UN Library OAI-PMH feed | `documents` table |
| `02_populate_reporting_entities.py` | DGACM/DRI source data | `report_entity_suggestions` |
| `03_generate_embeddings.py` | `documents.text` | `documents.embedding` |
| `04_extract_mandate_info.py` | Resolution full text | `resolution_mandates` |
| `05_ai_entity_suggestions.py` | Document titles + entities | `report_entity_suggestions` (source=ai) |
| `06_calculate_frequencies.py` | `documents.publication_date` | `report_frequencies` |

## Good to Know

- Use `npx shadcn@latest add <component>` to add new UI components
- The `systemchart.entities` table must exist before running `sql/reports_tables.sql` (FK dependency)
- The `chat_readonly` DB role (created by `sql/create_chat_user.sql`) is required for the AI chatbot's `query_database` tool
- Magic link tokens expire after 15 minutes; the rate-limit window is 2 minutes
- Session cookies expire after 30 days
