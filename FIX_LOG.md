# FIX_LOG.md – HackathonOS stabilization checklist

## Phase 1 – Vercel deployment failure (root cause & fix)
- [x] Identify invalid `runtime: "nodejs20.x"` in `vercel.json` and wrong function path.
- [x] Add `"engines": { "node": "20.x" }` to root `package.json`.
- [x] Export Express app from `@workspace/api-server` (`exports("./app")`).
- [x] Create `/api/index.ts` that re-exports the app for Vercel.
- [x] Update `vercel.json`: remove `functions` block, rewrite `/api/*` → `/api/index.ts`.
- [x] Verify locally: `pnpm install --frozen-lockfile && pnpm run typecheck && pnpm run build && pnpm test` all pass.

## Phase 2 – Build / deploy hygiene
- [ ] Move `helmet`, `express-rate-limit`, `@types/express-rate-limit` from root `package.json` into `artifacts/api-server/package.json`.
- [ ] Remove unused root dependencies (`@replit/connectors-sdk` if not used elsewhere).
- [ ] Document every required env var in `.env.example` (no real values).
- [ ] Make app fail fast with clear message if required env var missing.
- [ ] Remove Replit leftovers (`.replit`, `.replitignore`, `replit.md`, `.agents/memory`, `attached_assets`) if unused; add to `.gitignore` and `.vercelignore`.
- [ ] Update `DEPLOYMENT.md` with real working steps.

## Phase 3 – Bugs & errors
- [ ] Scan all source (`artifacts/*`, `lib/*`, `scripts/*`) for runtime errors, unhandled rejections, wrong imports, dead code, broken routes, bad env handling, race conditions, null/undefined crashes, mismatched API contracts.
- [ ] Fix each bug; record file, problem, fix in this log.

## Phase 4 – Buttons & UI functionality
- [ ] Enumerate every clickable element in frontend (buttons, links, forms, tabs, modals, dropdowns, nav items).
- [ ] Verify each has working handler, correct API call, loading/error/success states, disabled while pending.
- [ ] Check forms for validation & error messages.
- [ ] Check responsive layout & keyboard accessibility (labels, focus, aria).
- [ ] Produce table: element | location | was working? | fix.

## Phase 5 – Security audit
- [ ] Scan repo & git history for committed secrets; list any to rotate (do not print values).
- [ ] Backend: validate/sanitize all input (zod), auth/authorization on non-public routes, restrict CORS, keep helmet, rate limiting on auth & AI routes, safe error responses, body size limits, no SQL/NoSQL injection, no path traversal, no SSRF, no eval/dangerouslySetInnerHTML with user content, secure cookies/JWT.
- [ ] Run `pnpm audit`; fix/upgrade vulnerable packages where safe.
- [ ] Add security headers for frontend in `vercel.json` (CSP, X-Content-Type-Options, Referrer-Policy, etc.) without breaking app.

## Phase 6 – Testing
- [ ] Add Vitest + supertest for API routes (health, all routes happy path + invalid input + unauthorized).
- [ ] Add React Testing Library tests for main components & key button flows.
- [ ] Make `pnpm test` run all tests from root and pass; target ≥70% coverage on api-server.
- [ ] Add GitHub Actions workflow `.github/workflows/ci.yml` (install, typecheck, lint, test, build).

## Phase 7 – Quality
- [ ] Add/repair ESLint + Prettier config; run them.
- [ ] Add clear README with setup, env vars, scripts, deploy steps.

## Git & Deploy
- [ ] Commit in small logical commits with clear messages on `fix/stabilize-deploy`.
- [ ] Pre-push checklist: `pnpm install --frozen-lockfile && pnpm run typecheck && pnpm test && pnpm run build` all pass.
- [ ] Merge/push to `main`; record commit hashes.
- [ ] Verify new Vercel deployment builds successfully; test live URL (homepage, /api health, main buttons).

---
*Update this file as you complete each item.*