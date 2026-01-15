# UN Website Boilerplate (with Auth)

A Next.js template with UN branding and magic link authentication.

Based on: https://github.com/kleinlennart/un-website-boilerplate

## Features

- UN branding (logo, colors, Roboto font)
- Magic link authentication (@un.org emails only)
- PostgreSQL session/user storage
- Configurable database schema per app
- Entity autocomplete on first login
- Entity and document search components

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.template .env.local
```

Edit `.env.local`:
- `DATABASE_URL` - PostgreSQL connection string
- `DB_SCHEMA` - Schema for auth tables (e.g. `sg_reports_survey` → `sg_reports_survey.users`, `sg_reports_survey.magic_tokens`)
- `AUTH_SECRET` - Generate with `openssl rand -hex 32`
- `SMTP_*` - Mail server for magic links
- `BASE_URL` - Your app URL (for magic link emails)

### 3. Create database tables

Edit `sql/auth_tables.sql` and replace `sg_reports_survey` with your schema name (must match `DB_SCHEMA`), then:

```bash
psql $DATABASE_URL -f sql/auth_tables.sql
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Auth Flow

1. User clicks "Login" in header → `/login`
2. User enters @un.org email, magic link sent
3. User clicks link → `/verify?token=...`
4. First login: select entity (autocomplete); returning users: direct sign-in
5. Session cookie set (7 days)
6. Header shows user email, entity badge, and logout

## Customization

- **Site title/subtitle**: Edit `SITE_TITLE` and `SITE_SUBTITLE` in `src/components/Header.tsx`
- **Email domain restriction**: Edit `isValidUnEmail()` in `src/lib/auth.ts`
- **Entity list**: Query in `src/app/api/entities/route.ts`
- **Document search**: Query in `src/app/api/documents/search/route.ts`
- **Protected routes**: Edit `PUBLIC_PATHS` in `src/middleware.ts`
- **Auth schema**: Set `DB_SCHEMA` env var and update `sql/auth_tables.sql`

## File Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/             # Auth API routes
│   │   ├── documents/search/ # Document search
│   │   └── entities/         # Entity list
│   ├── login/                # Login page
│   ├── verify/               # Token verification + entity selection
│   └── page.tsx              # Public home page (demo)
├── components/
│   ├── DocumentSearch.tsx    # Document autocomplete
│   ├── EntitySearch.tsx      # Entity autocomplete
│   ├── Header.tsx            # Site header
│   ├── LoginForm.tsx         # Reusable login form
│   └── UserMenu.tsx          # User email + logout
├── lib/
│   ├── auth.ts               # Auth logic
│   ├── config.ts             # DB_SCHEMA config
│   ├── db.ts                 # PostgreSQL pool
│   ├── mail.ts               # Magic link emails
│   └── utils.ts              # Tailwind cn() helper
└── middleware.ts             # Route protection
sql/
└── auth_tables.sql           # Database schema
```

## Maintenance

### Check for issues
```bash
npm audit          # Security vulnerabilities
npm outdated       # Outdated packages
npm run lint       # ESLint errors
npx tsc --noEmit   # TypeScript errors
```

### Update packages
```bash
npm update                                              # Safe patch/minor updates
npm install next@latest eslint-config-next@latest       # Update Next.js
```

### Clean install (if issues occur)
```bash
rm -rf node_modules .next && npm install
```

## Good to know

- use `npx shadcn@latest add <component-name>` when you need to add components.

- https://nextjs.org/docs/app/api-reference/file-conventions/src-folder
- https://nextjs.org/docs/app/getting-started/project-structure

- The `/public` directory should remain in the root of your project.
- Config files like `package.json`, `next.config.js` and `tsconfig.json` should remain in the root of your project.
- `.env.*` files should remain in the root of your project.
- `src/app` or `src/pages` will be ignored if `app` or `pages` are present in the root directory.
- If you are using a `src` directory, consider moving other application folders such as `/components` or `/lib` into `src` for consistency.
- If you are using a Proxy, ensure it is placed inside the `src` folder.
- When using Tailwind CSS, add the `/src` prefix to the `content` array in your `tailwind.config.js` file to ensure proper scanning.
- If you use TypeScript path aliases like `@/*`, update the `paths` object in `tsconfig.json` to include `src/`.

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)
