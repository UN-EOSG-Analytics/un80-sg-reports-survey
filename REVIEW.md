# Code Review — UN80 SG Reports Survey

> Generated 2026-06-17. Covers commit `da88f68`.

---

## What This App Does

A **survey and analysis tool** used by UN-EOSG Analytics to manage the UN80 review of Secretary-General (SG) mandatory reports. The workflow is:

1. **Data pipeline (Python, `python/01–06_*.py`)** — scrapes the UN Digital Library, extracts report metadata, generates OpenAI embeddings, and calculates historical reporting frequencies. Results are written to PostgreSQL.
2. **Web app (Next.js 16 / React 19)** — authenticated UN-system staff review reports assigned to their entity, submit survey responses (continue / merge / discontinue, with frequency and format preferences), and confirm or reject AI-suggested entity assignments.
3. **Admin analysis page (`/analysis`)** — admins see aggregated coverage metrics, entity-level progress, frequency-direction breakdown, and can export data to Excel.
4. **AI chat (`/api/chat`)** — OpenAI-powered RAG chat over the reports database using a read-only DB role.
5. **Magic-link auth** — passwordless login; allowed domains come from a `allowed_domains` DB table. Admin privileges come from a separate `admin_emails` whitelist table (migration 007).

---

## Architecture Quality Assessment

### Strengths
- **Clean separation of concerns**: Python pipeline scripts are numbered and self-contained; TypeScript routes are thin and delegate to lib functions.
- **Parameterized SQL throughout**: no string interpolation of user input; query helper enforces `$N` placeholders.
- **Schema-prefix discipline**: all queries use explicit `${DB_SCHEMA}.table` — no `search_path` dependency.
- **Timing-safe session verification**: `timingSafeEqual` used in `src/lib/auth.ts`; custom HMAC also re-implemented correctly in `src/proxy.ts` (Edge).
- **Admin whitelist is a separate table** (migration 007), not a column on `users` — easier to audit.
- **React `cache()` on `getCurrentUser()`** — DB hit deduplicated across server-component tree.
- **ExcelJS export** is admin-only and DB-backed; no client-side data leakage.

### Weaknesses
- **No automated tests** at any layer (no `__tests__`, no `test_*.py`, no vitest config).
- **README is stale** — still describes the boilerplate template rather than the actual app.
- **`docs/TODO.md`** contains two open known bugs with no tracking.
- **`DB_SCHEMA` is hard-coded twice**: once in `src/lib/config.ts` (as `"app"` default) and again independently in each API route file (as `"sg_reports_survey"` default). These defaults differ — a misconfigured deployment silently hits the wrong schema.
- **Analysis page is a single 600-line server component** with 12 parallel DB queries inline — hard to test and maintain.
- **No migration runner / tracking**: migrations must be applied manually in numbered order; there is no `migrations` tracking table and no tooling to detect which have run.
- **Python scripts are imperative notebooks**: no unit tests, no type annotations on most functions, no CI.

---

## Correctness Bugs

### HIGH — Mismatched `DB_SCHEMA` defaults across the codebase

**File**: `src/lib/config.ts` and all API route files that shadow it.

`src/lib/config.ts` exports:
```ts
export const DB_SCHEMA = process.env.DB_SCHEMA || "app";
```

But every API route that needs `DB_SCHEMA` directly (e.g., `src/app/api/export/survey/route.ts`, `src/app/api/survey-responses/route.ts`, `src/app/analysis/page.tsx`) re-declares it locally with a different default:
```ts
const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";
```

If `DB_SCHEMA` env var is unset, `src/lib/config.ts` (which is used for auth table names via `tables.*`) will use schema `"app"` while all other routes will use `"sg_reports_survey"`. Auth would fail silently on a fresh deployment without `DB_SCHEMA` set. **Fix**: import and re-export `DB_SCHEMA` from `config.ts` everywhere; remove the duplicated default strings.

---

### HIGH — `x-forwarded-proto` header accepted uncritically in `getBaseUrl()`

**File**: `src/lib/get-base-url.ts` lines 21–24.

```ts
const protocol = headersList.get("x-forwarded-proto") || "https";
```

This value is used directly to construct the base URL that goes into magic-link emails:
```ts
return `${scheme}://${host}`;
```

If the app is run **without** a reverse proxy that strips/overrides these headers (e.g., direct Node exposure, some Docker setups), an attacker who can craft a request can set `x-forwarded-proto: http` (or an arbitrary scheme) to downgrade the magic-link URL to plain HTTP. The token in the link would then be transmitted in clear text on any subsequent redirect.

**Fix**: trust `x-forwarded-proto` only when `NODE_ENV === "production"` and optionally only when the connection originates from a known proxy IP. At minimum, clamp the result to `http` or `https`.

```ts
// Clamp to known schemes only
const scheme = host.startsWith("localhost")
  ? "http"
  : ["http", "https"].includes(protocol)
    ? protocol
    : "https";
```

---

### HIGH — Export route uses local `DB_SCHEMA` override, bypasses `config.ts`

**File**: `src/app/api/export/survey/route.ts` line 7.

This route re-declares `const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey"` and then uses it directly in SQL strings — bypassing the shared `tables` constants in `config.ts`. If the schema changes or the env var is renamed, this route will silently query the wrong schema while the rest of the app picks up the change from `config.ts`.

**Fix**: import `DB_SCHEMA` from `@/lib/config`.

---

### MEDIUM — Admin privileges derivable by entity members who guess a timing window

**File**: `src/lib/auth.ts` `getCurrentUser()` query.

The admin check is `LEFT JOIN ${tables.admin_emails} ae ON ae.email = u.email`. The `admin_emails` table is populated only by DBAs via SQL. This design is correct. However, the `users` table still has a `role` column stub in some older migration files (`003_add_entity_role.sql`), and **migration 007 only drops the column if it exists**. If migration 007 was never run (fresh installs following the boilerplate README, not the migration log), the `role` column still exists on `users` with a default of `'user'`, and the `getCurrentUser()` query ignores it — so role elevation via the column is not possible at runtime. But the stale schema inconsistency is confusing and could cause future issues.

**Fix**: document the required migration order explicitly; add a startup check or migration-applied table.

---

### MEDIUM — `Division by zero` in analysis page percentage calculations

**File**: `src/app/analysis/page.tsx` — multiple percentage bars.

`totalResponses` can be 0 when no responses have been submitted yet. Several inline style calculations divide by it:
```tsx
width: `${(s.count / data.totalResponses) * 100}%`
```
This produces `NaN%` (rendered as `width: NaN%` which browsers treat as `0` — not a crash, but a silent rendering bug). Similarly `totalContinueResponses` can be 0.

**Fix**: guard each division:
```tsx
width: `${data.totalResponses > 0 ? (s.count / data.totalResponses) * 100 : 0}%`
```

---

### MEDIUM — `entities` export route accepts arbitrary client-provided row data without auth check

**File**: `src/app/api/export/entities/route.ts`.

This is a `POST` route that accepts a JSON body of rows and converts them to Excel. There is **no authentication check** — any unauthenticated caller can send arbitrary data and receive a formatted Excel file. While the data itself is client-provided and not DB-backed, the endpoint could be abused to generate spoofed UN-branded Excel documents. The frontend that calls this route (`EntityTableExport.tsx`) is rendered only for admins, but the API itself is unprotected.

**Fix**: add `getCurrentUser()` + `user.role !== 'admin'` guard to this route.

---

### MEDIUM — Survey response `DELETE` does not validate that the row belongs to the current user's entity before deleting

**File**: `src/app/api/survey-responses/route.ts`, `DELETE` handler.

The delete query correctly scopes to `responded_by_user_id = $3` (the current user's ID), so a user cannot delete another user's response. This is correct. However, **an admin calling DELETE can only delete their own response** — there is no admin override to delete any response. This is likely intentional but is undocumented.

---

### LOW — Magic-link token is included verbatim in plain-text email fallback

**File**: `src/lib/mail.ts`.

The `text` fallback for the email includes the raw magic-link URL. This is expected behavior, but the URL is constructed from `getBaseUrl()` which, as noted above, trusts `x-forwarded-proto`. If that header is spoofed to `http`, the plain-text email also contains an HTTP link.

---

### LOW — Python scripts have no `.env` validation

**Files**: `python/01_get_reports.py` etc.

The scripts call `python-dotenv` but do not validate that required keys (`DATABASE_URL`, `OPENAI_API_KEY`) are present before making expensive API calls. A misconfigured environment causes a confusing runtime crash mid-pipeline rather than a clear startup error.

---

### LOW — `recentTokenExists` uses `> NOW() + INTERVAL '13 minutes'` to approximate a 2-minute cooldown

**File**: `src/lib/auth.ts`.

Tokens expire at 15 minutes. Checking `expires_at > NOW() + INTERVAL '13 minutes'` means a token must have been created less than ~2 minutes ago. This is correct in practice but fragile — if the token lifetime changes from 15 minutes, this interval must be updated in sync. Consider storing `created_at` on `magic_tokens` and querying that directly.

---

## Missing Test Coverage

| Layer | What's missing |
|---|---|
| TypeScript unit | `verifySession()` / `signSession()` round-trip; `normalizeBodyKey()`; `getBaseUrl()` under various env configs |
| TypeScript integration | API route auth guards (unauthenticated, non-admin, admin) |
| Python unit | `metadata_cleaning.py` normalization functions; frequency calculation logic in `06_calculate_frequencies.py` |
| Python integration | DB write scripts (would need a test DB or mocking) |
| E2E | Full survey submission flow; magic-link login flow |

---

## Documentation Gaps

1. **README.md** describes the boilerplate template, not the actual app. It references files that no longer exist (e.g., `components/EntityChangeDialog.tsx`, `components/VerifyForm.tsx` as described) and omits the Python pipeline, analysis page, export endpoints, and admin role.
2. **No API documentation** for the 13 API routes.
3. **`docs/TODO.md`** contains two open known bugs; these should be filed as GitHub issues.
4. **Migration order** is implicit (numbered filenames) with no migration-tracking table or tooling. `README.md` references only `sql/auth_tables.sql`, missing the 8 migrations.
5. **Python pipeline** has no README explaining how to run the numbered scripts, in what order, with what environment variables.
6. **`sql/schema`** subdirectory is empty; there is no canonical `schema.sql` snapshot — only incremental migration files and the original table-creation scripts.
