# UN SG Reports Survey

An internal web application for UN EOSG (Executive Office of the Secretary-General) staff to review Secretary-General reports, confirm entity ownership, and submit structured survey responses on each report's frequency and disposition.

Based on: https://github.com/kleinlennart/un-website-boilerplate

## Features

- UN branding (logo, colors, Roboto font)
- Magic link authentication (configurable email domains via DB)
- Rate limiting on magic link requests (2 min cooldown)
- 30-day session duration
- PostgreSQL session/user storage (raw SQL, no ORM — all in `sg_reports_survey` schema)
- pgvector-powered semantic document search
- AI chat assistant (Azure OpenAI GPT-4o) with database tool calls
- Entity selection on first login (with "Other" option)
- Entity change dialog (click entity badge in header)
- Two-step survey workflow per report (confirm frequency → submit feedback)
- Admin analytics dashboard (`/analysis`)
- XLSX export of survey responses
- Public landing page (`/about`) + protected dashboard (`/`)

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

Package manager is **pnpm**. Do not use npm or yarn.

### 2. Configure environment

```bash
cp .env.template .env.local
```

Edit `.env.local` with your values (see [Environment Variables](#environment-variables) below).

### 3. Set up the database

Run the SQL files in order on a PostgreSQL instance with the `pgvector` extension enabled:

```bash
# Auth tables (users, magic_tokens, allowed_domains, admin_emails)
psql $DATABASE_URL -f sql/auth_tables.sql

# Report and document tables (documents, report_entity_*, survey_responses, etc.)
psql $DATABASE_URL -f sql/reports_tables.sql
psql $DATABASE_URL -f sql/survey_responses_table.sql
psql $DATABASE_URL -f sql/frequency_confirmations_table.sql
psql $DATABASE_URL -f sql/report_frequencies_table.sql
psql $DATABASE_URL -f sql/views.sql

# Optional: restricted chat user (for the query_database AI tool)
psql $DATABASE_URL -f sql/create_chat_user.sql
```

Replace `sg_reports_survey` with your schema name if `DB_SCHEMA` differs.

### 4. Populate data (Python pipeline)

Run the numbered scripts in order to load UN Digital Library data:

```bash
uv run python python/01_get_reports.py
uv run python python/02_populate_reporting_entities.py
uv run python python/03_generate_embeddings.py
uv run python python/04_extract_mandate_info.py
uv run python python/05_ai_entity_suggestions.py
uv run python python/06_calculate_frequencies.py
```

Scripts are idempotent — safe to re-run after data updates.

### 5. Run

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Commands

```bash
pnpm dev          # Dev server → http://localhost:3000
pnpm build        # Production build
pnpm start        # Start production server
pnpm lint         # ESLint
pnpm typecheck    # TypeScript type-check (no emit)
pnpm test         # Unit tests (Vitest)
pnpm test:chat    # Integration smoke test for the AI chat endpoint (needs DB + API keys)
pnpm format       # Prettier
```

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DB_SCHEMA` | Yes | Schema name (default: `sg_reports_survey`) |
| `AUTH_SECRET` | Yes (prod) | HMAC secret for session cookies — `openssl rand -hex 32`. Falls back to a dev default if unset; **must** be set in production. |
| `SMTP_HOST` | Yes | Outbound mail server for magic links |
| `SMTP_PORT` | Yes | Mail server port |
| `SMTP_USER` | Yes | Mail server username |
| `SMTP_PASS` | Yes | Mail server password |
| `BASE_URL` | Yes | Public URL of the app (used in magic link emails) |
| `AZURE_OPENAI_API_KEY` | Yes | Azure OpenAI key for the AI chat assistant |
| `AZURE_OPENAI_ENDPOINT` | Yes | Azure OpenAI endpoint |
| `AZURE_OPENAI_DEPLOYMENT` | Yes | Deployment name (e.g. `gpt-4o`) |
| `CHAT_READONLY_DATABASE_URL` | Optional | Restricted DB connection for the `query_database` chat tool (chat_readonly role). Falls back to `DATABASE_URL` if unset — set this in production to isolate chat SQL access. |

## Auth Flow

1. User visits `/about` (public landing page)
2. User clicks "Sign In" → `/login`
3. User enters email; magic link sent (rate limited: 2-min cooldown)
4. User clicks link → `/verify?token=…` (token valid 15 min, single-use)
5. First login: select entity; returning users: direct sign-in
6. Session cookie set (30 days, HMAC-signed)
7. Header shows user email, clickable entity badge (to change), and logout
8. Unauthenticated users accessing protected routes → redirect to `/about`

## File Structure

```
src/
├── app/
│   ├── about/                # Public landing page
│   ├── analysis/             # Admin analytics dashboard
│   ├── api/
│   │   ├── chat/             # AI chat endpoint (streaming, tool calls)
│   │   ├── entity-confirmations/
│   │   ├── frequency-confirmations/
│   │   ├── sg-reports/       # Main reports list API
│   │   ├── survey-responses/ # Survey CRUD + my-responses
│   │   ├── stats/            # Aggregate statistics
│   │   └── ...
│   ├── login/
│   ├── reports/              # All-reports browser
│   ├── verify/
│   └── page.tsx              # Protected dashboard (entity view)
├── components/
│   ├── SGReportsList.tsx     # Main reports table (entity & global modes)
│   ├── ReportSidebar.tsx     # Two-step survey workflow panel
│   ├── EntityDashboard.tsx   # Per-entity landing
│   ├── FrequencyBadge.tsx    # Publication frequency display
│   ├── EntityBadges.tsx      # Entity confirmation badges
│   ├── chat/                 # AI chat UI components
│   └── ui/                   # shadcn/ui primitives
├── lib/
│   ├── auth.ts               # Magic link auth, sessions, getCurrentUser
│   ├── chat-tools.ts         # AI tool definitions + SQL safety check
│   ├── config.ts             # DB_SCHEMA + table name helpers
│   ├── db.ts                 # PostgreSQL pool + query()
│   ├── db-chat.ts            # Restricted DB pool for chat tool
│   ├── mail.ts               # Magic link emails
│   └── utils.ts              # Tailwind cn() helper
└── middleware.ts             # Route protection (PUBLIC_PATHS)
sql/
├── auth_tables.sql           # Auth schema
├── reports_tables.sql        # Documents + entity tables
├── survey_responses_table.sql
├── frequency_confirmations_table.sql
├── report_frequencies_table.sql
├── create_chat_user.sql      # Restricted read-only DB role for chat
└── views.sql
python/                       # Data pipeline scripts (run in order)
docs/
├── TODO.md                   # Known bugs and limitations
└── ...
```

## Customization

- **Site title/subtitle**: Edit `SITE_TITLE` and `SITE_SUBTITLE` in `src/components/Header.tsx`
- **Allowed email domains**: Add to `allowed_domains` table in database
- **Entity list**: Sourced from `systemchart.entities` (external schema)
- **Protected routes**: Edit `PUBLIC_PATHS` in `src/middleware.ts`
- **Auth schema**: Set `DB_SCHEMA` env var and update `sql/auth_tables.sql`

## Maintenance

```bash
pnpm audit          # Security vulnerabilities
pnpm outdated       # Outdated packages
pnpm lint           # ESLint errors
pnpm typecheck      # TypeScript errors
```

## Known Issues

See `docs/TODO.md`. The main open bugs are:

1. Dashboard survey column reads current user's responses only (should be entity-level)
2. Confirmed one-time reports still show "Go to survey" badge
3. Multi-entity one-time confirmation edge case (schema limitation in `report_frequency_confirmations`)

## Notes

- Add shadcn components: `npx shadcn@latest add <component-name>`
- The `/public` directory, config files (`package.json`, `next.config.ts`, `tsconfig.json`), and `.env.*` files must remain at the project root.
- [Next.js Documentation](https://nextjs.org/docs)
