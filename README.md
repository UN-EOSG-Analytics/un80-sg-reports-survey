# UN SG Reports Survey

An internal web app for the United Nations EOSG to track, confirm, and analyze UN Secretary-General reports across all UN entities. Users from each UN entity sign in, confirm which SG reports their entity is responsible for, and administrators review overall progress.

## Features

- **Report Browser** — Browse and search the full list of SG reports with entity assignments
- **Entity Confirmations** — Each entity confirms their lead/contributing roles for assigned reports
- **Survey Responses** — Users respond to structured survey questions per report
- **AI Chat** — Ask natural-language questions about the reports database (powered by Azure OpenAI + pgvector similarity search)
- **Excel Export** — Admin-only export of entity progress to Excel
- **Analysis Dashboard** — Overview of response rates and confirmation status across all entities
- **Magic Link Auth** — Passwordless authentication via email magic links (`@un.org` and other UN system domains)
- **Entity Selection** — First-login entity selection; entity badge in header for easy switching

## Tech Stack

- **Framework**: Next.js 15 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **Database**: PostgreSQL with pgvector extension (for similarity search)
- **Authentication**: Custom magic-link auth (HMAC-signed tokens, 30-day sessions)
- **AI**: Azure OpenAI (GPT-4o) via Vercel AI SDK; pgvector for semantic document retrieval
- **Export**: ExcelJS for `.xlsx` generation

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL with pgvector extension
- Azure OpenAI deployment

### Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.template .env.local
```

Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Main PostgreSQL connection string (admin user) |
| `DATABASE_URL_CHAT` | Read-only PostgreSQL connection for AI chat queries |
| `DB_SCHEMA` | Schema name (e.g. `sg_reports_survey`) |
| `AUTH_SECRET` | HMAC signing secret (`openssl rand -hex 32`) |
| `BASE_URL` | Public URL of the app (for magic link emails) |
| `SMTP_HOST` | Mail server hostname |
| `SMTP_PORT` | Mail server port |
| `SMTP_USER` | Mail username |
| `SMTP_PASS` | Mail password |
| `SMTP_FROM` | From address for magic link emails |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI key (AI chat feature) |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint |
| `AZURE_OPENAI_DEPLOYMENT` | GPT-4o deployment name |

3. Provision the database (run in this order):

```bash
# Auth and user tables
psql "$DATABASE_URL" -f sql/auth_tables.sql

# Application tables
psql "$DATABASE_URL" -f sql/reports_tables.sql
psql "$DATABASE_URL" -f sql/survey_responses_table.sql
psql "$DATABASE_URL" -f sql/report_frequencies_table.sql
psql "$DATABASE_URL" -f sql/frequency_confirmations_table.sql

# Views
psql "$DATABASE_URL" -f sql/views.sql

# Apply all migrations in order
for f in sql/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done

# Create read-only chat user (requires superuser)
psql "$DATABASE_URL" -f sql/create_chat_user.sql
```

> **Note:** `sql/auth_tables.sql` defines users, magic_tokens, sessions, allowed_domains, and admin_emails. The schema reflects the state after all migrations have been applied (notably, migration 007 drops the `role` column from `users` and adds `admin_emails`).

4. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Python Data Pipeline

The `python/` directory contains scripts for ingesting SG report metadata from UN Digital Library and other sources. Run them in order:

```
01_fetch_sg_reports.py      # Download report metadata from UN Digital Library
02_process_reports.py       # Normalize and deduplicate records
03_fuse_ceb_revenue.py      # Merge CEB revenue data
04_...                      # (see individual script headers for details)
```

Requirements: `pip install -r python/requirements.txt` (or use `uv`/`pyproject.toml` if present).

## Auth Flow

1. User visits `/about` (public landing page)
2. User enters email → magic link sent (2-minute cooldown per email)
3. User clicks link → token verified → session cookie set (30 days)
4. First login: select entity from dropdown; returning users: direct sign-in
5. Header shows email + entity badge (click to change entity)
6. Unauthenticated access to protected routes → redirect to `/about`

## Admin Access

Admin users are identified via the `admin_emails` table (added in migration 007). Admins can:
- Export entity progress to Excel (`/api/export/survey`)
- View all users and their entities
- Access analysis dashboard

To add an admin:
```sql
INSERT INTO sg_reports_survey.admin_emails (email) VALUES ('admin@un.org');
```

## AI Chat

The AI chat feature (`/chat`) lets users ask questions about SG reports. The assistant:
- Uses Azure OpenAI (GPT-4o) for language understanding
- Has access to two tools: `read_document` (fetch full text of a report by symbol) and `query_database` (read-only SQL queries via a restricted `chat_readonly` DB user)
- The `chat_readonly` DB user (created by `sql/create_chat_user.sql`) has SELECT-only access to non-sensitive tables

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/             # Magic link request + verify
│   │   ├── chat/             # AI chat endpoint
│   │   ├── entity-confirmations/ # Lead/contributing confirmations
│   │   ├── export/           # Excel export (survey + entities)
│   │   ├── sg-reports/       # Report list + filter
│   │   └── survey-responses/ # Survey answer CRUD
│   ├── analysis/             # Admin analysis dashboard
│   ├── chat/                 # AI chat UI
│   └── page.tsx              # Main dashboard
├── components/               # React components
├── lib/
│   ├── auth.ts               # Magic link, session, HMAC logic
│   ├── chat-tools.ts         # AI tool implementations (readDocument, queryDatabase)
│   ├── db.ts                 # Main DB pool (admin user)
│   ├── db-chat.ts            # Read-only DB pool (chat_readonly user)
│   └── ...
sql/
├── auth_tables.sql           # users, magic_tokens, sessions, allowed_domains, admin_emails
├── reports_tables.sql        # documents, report_entity_confirmations
├── survey_responses_table.sql
├── report_frequencies_table.sql
├── frequency_confirmations_table.sql
├── views.sql
├── create_chat_user.sql      # Creates chat_readonly PostgreSQL role
└── migrations/               # Incremental schema changes (apply in order)
python/                       # Data ingestion pipeline scripts
```
