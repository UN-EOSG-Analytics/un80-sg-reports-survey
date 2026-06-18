# Code Review — UN80 SG Reports Survey

_Reviewed: 2026-06-18_

## Executive Summary

A purpose-built survey platform for UN entities to review and respond to Secretary-General reports. The magic-link authentication, database parameterisation, and AI chat's SQL safety layer are well-implemented. Several security issues require attention: entity-level lateral deletion of confirmations, admin bulk-read of all survey responses without per-entity gating, indefinite retention of AI chat logs (GDPR risk), and no rate-limiting on AI tool execution. There are also no automated tests and no CLAUDE.md.

---

## Recent Changes Reviewed

| Commit | Date | Description | Quality |
|--------|------|-------------|---------|
| `da88f68` | Apr 20 | Enhance analysis page | ✓ Admin analytics improvements |
| `baec12d` | Apr 17 | Add frequency direction field | ✓ Feature addition |
| `9a4d7cf` | Apr 17 | Update analysis page | ✓ |
| `487a1e0` | Mar 2 | Survey export (Excel) | ✓ Useful admin export |
| `22499d5` | Mar 2 | Entity source breakdown + export | ✓ |
| `a2d7b5c` | Feb 19 | Dynamic host retrieval | ✓ Deployment robustness |
| `a2d7b5c7` | Feb 18 | Admin email whitelist | ✓ Clean RBAC approach |

---

## Security Review

### SEC-1: Entity confirmation lateral deletion (High)

**File:** `src/app/api/entity-confirmations/route.ts` (DELETE handler)  
**Severity:** High

The deletion check grants permission to any user whose `entity` matches the confirmation's entity field:

```typescript
// Current (too broad):
if (user.entity === entity || user.id === confirmation.created_by) {
  // allow delete
}
```

This means User A at Entity X can delete all Entity X confirmations, including those created by User B at Entity X. The intent is almost certainly to allow only the creator (or an admin) to delete.

**Fix:**
```typescript
if (user.role === 'admin' || user.id === confirmation.created_by) {
  // allow delete
}
```

---

### SEC-2: Admin reads all survey responses without entity gating (Medium)

**File:** `src/app/api/survey-responses/route.ts` (GET handler for admin)  
**Severity:** Medium

When `user.role === 'admin'`, the query returns responses from all entities with no filtering. The response includes `responder_email` fields. This means any admin account can enumerate which staff members at which entities submitted responses.

**Fix:** Log all admin bulk-read requests to an audit table. Consider whether `responder_email` needs to be returned at all — if only aggregated analytics are needed, strip the email field from the admin response.

---

### SEC-3: AI chat logs stored indefinitely (Medium — GDPR)

**File:** `src/lib/chat-logger.ts`, `sql/schema/current_schema.sql`  
**Severity:** Medium

All AI chat interactions (user messages, tool calls, LLM responses, user IDs) are logged to `ai_chat_logs` with no expiry or user-controlled deletion. Users may ask sensitive questions about specific UN entities or individuals that should not be retained forever.

**Fix:** Add a retention policy (e.g. 90-day automatic deletion). Add an admin endpoint to delete a user's chat history on request. Document the retention policy in the application's privacy notice.

---

### SEC-4: No rate limiting on AI chat tool execution (Low)

**File:** `src/lib/chat-tools.ts`, `src/app/api/chat/route.ts`  
**Severity:** Low

Authenticated users can execute `query_database` and `read_document` tools in rapid succession with no per-user rate limit. A single user could run expensive vector-search queries or large table scans at will.

**Fix:** Add a per-user rate limit (e.g. 20 tool calls per minute) at the chat API handler level.

---

### SEC-5: Regex-based SQL safety in AI chat (Low)

**File:** `src/lib/chat-tools.ts`  
**Severity:** Low — defence in depth gap

The AI `query_database` tool blocks dangerous SQL via regex word-boundary matching (`/\bDROP\b/i` etc.). Regex-based SQL parsing is fragile — obfuscation like `DR/**/OP` or Unicode homoglyphs can bypass it. The database-level read-only role is the real enforcement layer, but the regex is presented as a safety measure.

**Fix:** Document that the regex is a best-effort UX guard, not a security boundary. Rely on the DB role grant for real enforcement. Consider using a SQL parser library for more reliable structural analysis.

---

## Authentication Review

### AUTH-1: Magic link auth — CORRECT ✓

15-minute token expiry, single-use, timing-safe comparison, 2-minute resend cooldown, email domain whitelist via `allowed_domains` table. Session tokens are HMAC-SHA256 signed with `AUTH_SECRET`, `httpOnly`+`Secure` cookies, 30-day expiry. Strong implementation.

### AUTH-2: No explicit middleware.ts found

No `src/middleware.ts` was found. Route protection appears to rely on `getCurrentUser()` checks inside each API handler. This is functionally correct but means a new route added without an auth check would be silently public. Consider adding Next.js middleware as a belt-and-suspenders guard on `/api/*` routes.

---

## Known Issues (from docs/TODO.md)

1. **Dashboard survey badge:** Shows "Go to survey" for confirmed one-time reports — should be hidden.
2. **Multi-entity one-time conflict:** If 2+ entities confirm the same report as one-time, only the last entity's confirmation is recorded in `report_frequency_confirmations` (schema limitation — needs migration to support multiple records).

---

## Test Coverage

Zero test files. The highest-value tests to add:

| Area | Test type | Why |
|------|-----------|-----|
| Magic link token expiry | Unit | 15-min boundary, single-use enforcement |
| Entity confirmation delete permission | Unit | Covers the lateral deletion bug |
| Survey response admin visibility | Integration | Verify entity-gating once added |
| Chat SQL safety | Unit | Regex boundary cases |
| Export endpoint auth | Unit | Verify 403 for non-admin |

---

## Missing Documentation

- **No CLAUDE.md** — project architecture, database schema, auth flow, and AI pipeline are undocumented for Claude Code contributors.
- **No SECURITY.md** — security architecture should be in a dedicated, discoverable file.
- **No API reference** — the 10+ API routes have no OpenAPI or inline documentation.
- **No `.env.example`** (verify) — required environment variables should be documented.

---

## Recommendations (Priority Order)

1. **(High)** Fix entity confirmation DELETE to check `created_by` or admin role only (not entity-match).
2. **(Medium)** Add access logging for admin bulk-reads of survey responses; strip `responder_email` unless actually needed.
3. **(Medium)** Add AI chat log retention policy (90-day auto-delete) and user deletion endpoint.
4. **(Low)** Add per-user rate limit on AI chat tool execution.
5. **(Low)** Create `CLAUDE.md` documenting project architecture for Claude Code contributors.
6. **(Low)** Add Next.js `middleware.ts` as belt-and-suspenders route protection on `/api/*`.
7. **(Low)** Unit tests for token expiry, deletion permissions, and SQL safety layer.
8. **(Low)** Fix one-time report frequency conflict (multi-entity schema limitation, item 2 in TODO.md).
