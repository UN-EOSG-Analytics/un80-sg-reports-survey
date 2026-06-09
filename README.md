# UN80 SG Reports Survey

A web application for the United Nations Executive Office of the Secretary-General (EOSG) to collect structured feedback from UN entities on Secretary-General reports submitted to Member States.

UN entities (UNDP, UNICEF, WHO, etc.) use this tool to review their assigned reports and submit recommendations: **continue**, **continue with changes**, **merge**, or **discontinue** — along with preferred frequency and format.

## Features

- **Report browser** — filterable, searchable list of all SG reports (2023–present), grouped by series and UN body
- **Entity dashboard** — entity-scoped view showing confirmed reports and survey completion progress
- **Survey form** — structured per-report recommendations with frequency, format, and freetext comments
- **AI chat assistant** — natural language Q&A over the full report corpus (vector search + SQL tool-use, powered by Azure OpenAI)
- **Admin analysis page** — coverage stats, response breakdowns, per-entity progress, Excel export
- **Magic-link auth** — passwordless login for `@un.org` and partner domains; 30-day sessions

## Setup

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
| `DATABASE_URL` | PostgreSQL connection string (must have `pg_vector` extension) |
| `DB_SCHEMA` | Database schema name (default: `sg_reports_survey`) |
| `AUTH_SECRET` | HMAC secret: `openssl rand -hex 32` |
| `SMTP_HOST` | Mail server for magic links |
| `SMTP_PORT` | Mail server port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | From address for magic link emails |
| `BASE_URL` | Public URL (used in magic link emails, e.g. `https://your-app.example.com`) |
| `AZURE_OPENAI_ENDPOINT` | Azure AI Foundry endpoint (for AI chat) |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key |
| `AZURE_OPENAI_DEPLOYMENT` | Model deployment name (e.g. `gpt-5`) |
| `AZURE_OPENAI_API_VERSION` | API version (e.g. `2024-05-01-preview`) |

### 3. Create database tables

Run the SQL files in order:

```bash
# 1. Auth tables (users, tokens, domain whitelist)
psql $DATABASE_URL -f sql/auth_tables.sql

# 2. Documents and entity tables
psql $DATABASE_URL -f sql/reports_tables.sql

# 3. Frequency tables
psql $DATABASE_URL -f sql/report_frequencies_table.sql
psql $DATABASE_URL -f sql/frequency_confirmations_table.sql

# 4. Survey responses
psql $DATABASE_URL -f sql/survey_responses_table.sql

# 5. Views (depends on all tables above)
psql $DATABASE_URL -f sql/views.sql

# 6. Chat read-only user
psql $DATABASE_URL -f sql/create_chat_user.sql
```

Then apply migrations in order:
```bash
for f in sql/migrations/*.sql; do psql $DATABASE_URL -f "$f"; done
```

### 4. Run the data pipeline (Python)

The Python pipeline populates the database with report metadata, embeddings, and entity suggestions. Run steps in order:

```bash
# Install Python dependencies (requires Python 3.13+)
uv sync   # or: pip install -e .

# Copy environment config
cp .env.template .env
# Edit .env to add DATABASE_URL, DB_SCHEMA, AWS_API_URL (UN Library API), OPENAI_API_KEY

# Step 1: Fetch SG reports from UN Digital Library and store in DB
python python/01_get_reports.py --start-year 2023

# Step 2: Populate reporting entities from DGACM/DRI source files
python python/02_populate_reporting_entities.py

# Step 3: Generate vector embeddings for all documents
python python/03_generate_embeddings.py

# Step 4: Extract mandate info from resolutions (optional, slow)
python python/04_extract_mandate_info.py

# Step 5: AI entity suggestions (maps reports to entities)
python python/05_ai_entity_suggestions.py

# Step 6: Calculate historical frequencies per report series
python python/06_calculate_frequencies.py
```

### 5. Run the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Development Commands

```bash
pnpm dev            # Start dev server (Next.js + Turbopack)
pnpm build          # Production build
pnpm start          # Start production server
pnpm lint           # ESLint
pnpm typecheck      # TypeScript type-check (no emit)
pnpm format         # Prettier format
pnpm format:check   # Prettier check
pnpm test           # Run unit tests (Vitest)
pnpm test:chat      # Integration smoke-test: AI chat against live API
```

## Project Structure

```
src/
├── app/
│   ├── about/            # Public landing page
│   ├── analysis/         # Admin analysis dashboard
│   ├── api/
│   │   ├── auth/         # Magic-link auth endpoints
│   │   ├── chat/         # AI chat SSE streaming endpoint
│   │   ├── documents/    # Document search
│   │   ├── entities/     # Entity list
│   │   ├── entity-confirmations/   # Confirm entity ownership
│   │   ├── entity-suggestions/     # AI entity suggestions
│   │   ├── export/       # Admin Excel exports
│   │   ├── frequency-confirmations/ # One-time confirmations
│   │   ├── reports/      # Entity-scoped report list
│   │   ├── sg-reports/   # Full SG reports list
│   │   ├── similar-reports/ # Vector similarity search
│   │   ├── stats/        # Aggregate stats
│   │   └── survey-responses/ # Survey CRUD
│   ├── login/            # Login page
│   ├── reports/          # All-reports browser page
│   ├── stats/            # Stats page
│   ├── verify/           # Token verification + entity selection
│   └── page.tsx          # Home / entity dashboard
├── components/
│   ├── SGReportsList.tsx     # Main report browser table
│   ├── ReportSidebar.tsx     # Detail sidebar + survey form
│   ├── EntityDashboard.tsx   # Entity-scoped home dashboard
│   ├── EntityBadges.tsx      # Entity suggestion/confirmation display
│   ├── FrequencyBadge.tsx    # Frequency label with colors
│   ├── DocumentSymbolBadge.tsx # UN document symbol link
│   ├── Treemap.tsx           # SVG treemap visualization
│   ├── SurveyExportButton.tsx
│   ├── EntityTableExport.tsx
│   ├── chat/                 # Chat UI components
│   └── ui/                   # shadcn/ui primitives
├── lib/
│   ├── auth.ts               # Magic-link auth, sessions, HMAC
│   ├── chat-tools.ts         # AI tool definitions + execution
│   ├── chat-logger.ts        # Chat interaction logging
│   ├── config.ts             # DB_SCHEMA + table name helpers
│   ├── db.ts                 # PostgreSQL pool + query helper
│   ├── db-chat.ts            # Read-only DB pool for AI chat
│   ├── entities.ts           # Entity fetch helper
│   ├── mail.ts               # Magic link email sender
│   └── utils.ts              # Tailwind cn() helper
├── proxy.ts              # Next.js middleware (route protection)
└── types/                # Shared TypeScript types
python/
├── 01_get_reports.py             # Fetch + store documents
├── 02_populate_reporting_entities.py
├── 03_generate_embeddings.py
├── 04_extract_mandate_info.py
├── 05_ai_entity_suggestions.py
├── 06_calculate_frequencies.py
└── util/                         # Shared utilities
sql/
├── auth_tables.sql
├── reports_tables.sql
├── survey_responses_table.sql
├── frequency_confirmations_table.sql
├── report_frequencies_table.sql
├── views.sql
├── create_chat_user.sql
└── migrations/                   # Numbered incremental migrations
```

## Auth Flow

1. User visits `/about` (public landing)
2. Clicks “Sign In” → `/login` → enters `@un.org` email
3. Magic link sent (rate-limited: 2-min cooldown)
4. Clicks link → `/verify?token=...`
5. First login: select entity from dropdown; returning users: direct sign-in
6. Session cookie set (30 days, HMAC-SHA256 signed)
7. Unauthenticated access to protected routes redirects to `/about`

## Admin Access

Admin users are whitelisted by email in the `admin_emails` table (see `sql/migrations/007_admin_emails_whitelist.sql`). Admins can:
- View the `/analysis` page with full survey coverage statistics
- See all responses for any report (not just their own entity)
- Export survey data to Excel

## Database Migrations

Migrations are numbered SQL files in `sql/migrations/`. Apply them in order against your database. Do **not** re-run the base table creation files after initial setup — use migrations for schema changes.

## Deployment

The application is a standard Next.js app. It has been tested on Vercel and direct Node.js deployments. Required:
- PostgreSQL 14+ with `pg_vector` extension enabled (Azure Database for PostgreSQL Flexible Server works)
- SMTP server for magic link emails
- Azure OpenAI endpoint for the AI chat feature

## Maintenance

```bash
npm audit              # Security vulnerabilities
npm outdated           # Outdated packages
pnpm lint              # ESLint
pnpm typecheck         # TypeScript errors
```
