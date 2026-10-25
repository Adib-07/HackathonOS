# FIX_LOG.md – HackathonOS stabilization log

## Architecture Summary
- **Monorepo** (pnpm 11, Node 24) with workspaces:
  - `artifacts/hackathon-os` – Vite 7 + React 19 SPA (TypeScript). Entry `src/main.tsx` → `App.tsx`. Uses Clerk React SDK (`@clerk/react`) for auth, TanStack Query, wouter router, TailwindCSS.
  - `artifacts/api-server` – Express 5 (ESM) server. Exports `app` from `src/app.ts`; `src/index.ts` starts HTTP listener locally. Bundled with **esbuild** (`build.mjs`) to `dist/app.mjs` and `dist/index.mjs`. Dependencies: `@clerk/express`, `helmet`, `express-rate-limit`, `cors`, `cookie-parser`, `pino`, `drizzle-orm` + `pg`, workspace libs `@workspace/db`, `@workspace/api-zod`.
  - `lib/db` – Drizzle ORM schema + migrations (PostgreSQL). Exports `db`, `pool`, tables.
  - `lib/api-zod` – Zod request/response schemas.
  - `lib/api-client-react` – Generated TanStack Query hooks (orval).
  - `scripts/` – utility scripts (post‑merge hook).
  - `artifacts/mockup-sandbox` – dev‑only UI sandbox (not deployed).

- **Auth flow**: Clerk (frontend `VITE_CLERK_PUBLISHABLE_KEY`, backend `CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY`). Frontend `ClerkProvider` with proxy URL `/api/__clerk` (proxied by API via `http-proxy-middleware`). Backend `clerkMiddleware` validates sessions; `requireAuthenticatedUser` middleware attaches `userId` to `res.locals`.

- **API routes** (all under `/api`):
  - `GET /healthz` → `{status:"ok"}` (public)
  - `/competitions*` CRUD, planning, tasks, evidence
  - `/intel` analysis, research, gaps, ideas, briefs
  - All protected by `requireAuthenticatedUser`; ownership enforced via `ownerId` checks.

- **Data layer**: PostgreSQL (managed, e.g., Neon). Drizzle migrations in `lib/db/drizzle/`. `DATABASE_URL` required at runtime.

- **Deployment** (Vercel Hobby):
  - `vercel.json` defines:
    - `installCommand: pnpm install --frozen-lockfile`
    - `buildCommand: pnpm --filter @workspace/hackathon-os run build` (currently **only front‑end**)
    - `outputDirectory: artifacts/hackathon-os/dist/public`
    - `functions: { "api/index.mjs": { maxDuration:30 } }`
    - rewrites: `/api/* → /api`, `/* → /index.html`
  - Serverless function entry `api/index.mjs` imports `../artifacts/api-server/dist/app.mjs` (pre‑bundled Express app). No `runtime` key; Node version from root `engines.node = "24.x"`.

- **Environment variables** (see `.env.example`):
  - Runtime (server): `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `LOG_LEVEL`, `OPENAI_*`
  - Build‑time (client): `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PROXY_URL`, `BASE_PATH` (via `BASE_URL` from Vite)
  - `PORT` only for local dev.

---

## Phase 0 – Orientation (completed above)

---

## Phase 1 – Fix blank page & 100% function errors (production blocker)

### 1.1 Findings (from inspecting repo & Vercel logs)

| # | Area | Issue | Severity | Evidence |
|---|------|-------|----------|----------|
| 1 | Frontend build | `VITE_CLERK_PUBLISHABLE_KEY` required at **build time**; if missing, `App.tsx` throws at module evaluation → blank page. | Critical | `App.tsx` line 50‑52 throws `Error('Missing VITE_CLERK_PUBLISHABLE_KEY…')`. |
| 2 | Frontend runtime | `BASE_URL` from Vite (`import.meta.env.BASE_URL`) used as `basePath`. If `BASE_PATH` env not set, Vite defaults to `/` – OK. | Low | `App.tsx` line 37. |
| 3 | API function bundle | `vercel.json` `buildCommand` only builds front‑end (`pnpm --filter @workspace/hackathon-os run build`). **API server not built**, so `artifacts/api-server/dist/app.mjs` missing → function import fails → 100% error rate. | Critical | `api/index.mjs` imports `../artifacts/api-server/dist/app.mjs`; that file only created by `pnpm run build` (root script) which runs `api-server` build. |
| 4 | API function entry | `api/index.mjs` uses relative import `../artifacts/api-server/dist/app.mjs`. Vercel packages the function **alone**; files outside the function folder are **not included** unless bundled. The import will fail at runtime because the target file isn’t packaged. | Critical | Vercel serverless functions only include the entry file and its resolved dependencies (node_modules). |
| 5 | API startup side‑effects | `api-server/src/app.ts` throws if `CLERK_SECRET_KEY` missing in production (line 100‑106). Good – fast‑fail, but needs env vars set. | Medium | Code visible. |
| 6 | DB connection pool | `lib/db/src/index.ts` creates a `pg.Pool` at module load. In serverless, pool persists across invocations → okay, but `max` connections should be low (default 10). | Low | `lib/db/src/index.ts`. |
| 7 | Missing health endpoint without DB | `/api/healthz` exists (public) – good. Need `/api/readyz` that checks DB. | Low | `artifacts/api-server/src/routes/health.ts`. |
| 8 | Error boundary | Frontend has `ErrorBoundary` component (used in `main.tsx` and `App.tsx`). Should prevent blank page on render errors. | Low | `src/components/error-boundary.tsx` (not read yet). |

### 1.2 Immediate Fixes Required

| Fix | Description | Files |
|-----|-------------|-------|
| **A** | Ensure `VITE_CLERK_PUBLISHABLE_KEY` is set in Vercel **Build‑time** env (Preview & Production). | Vercel dashboard (no code change). |
| **B** | Change `vercel.json` `buildCommand` to run **full monorepo build** (`pnpm run build`) so API bundle is produced. | `vercel.json` |
| **C** | Re‑package API as a **single self‑contained bundle** for Vercel function (esbuild) and point function entry to that bundle, avoiding external file reference. | New `api/build.mjs` or adjust `api/index.mjs` to import bundled file placed next to it (e.g., `api/bundle.mjs`). |
| **D** | Add startup env validation (zod) for both client and server to fail fast with clear messages (no secret leakage). | New `src/lib/env-validation.ts` (server) and `src/lib/client-env.ts` (client). |
| **E** | Add `/api/readyz` endpoint that checks DB connectivity. | `artifacts/api-server/src/routes/health.ts` (add route). |
| **F** | Verify ErrorBoundary renders fallback UI (add visible fallback). | `src/components/error-boundary.tsx`. |
| **G** | Add security headers for front‑end via `vercel.json` `headers` (CSP, etc.) – already partially there. | `vercel.json`. |

### 1.3 Implementation Plan (commits)

1. **fix(vercel): run full build for API bundle** – update `vercel.json` `buildCommand` to `pnpm run build`.
2. **fix(api): bundle API for Vercel function** – add `api/build.mjs` (esbuild) that bundles `../artifacts/api-server/src/app.ts` + deps into `api/bundle.mjs`; change `api/index.mjs` to `import app from "./bundle.mjs"`; add `api/build` step to root `build` script (or rely on root build).  
3. **feat(env): add zod env validation** – server and client.
4. **feat(api): add /api/readyz** – DB ping.
5. **feat(frontend): improve ErrorBoundary fallback UI**.
6. **chore(vercel): add CSP headers**.

Each commit will be verified with `pnpm install --frozen-lockfile && pnpm run typecheck && pnpm test && pnpm run build` before push.

---

## Phase 2 – Full bug sweep (to do after Phase 1)

- Run full typecheck, lint, test; catalog `any`, `@ts-ignore`, dead code, etc.
- Run `knip` / `depcheck` for unused deps.
- Fix runtime errors, unhandled rejections, null crashes, contract mismatches.

---

## Phase 3 – Buttons, forms, user flows (to do)

- Inventory interactive elements.
- Verify handlers, loading/error states, accessibility.

---

## Phase 4 – Security hardening (to do)

- Secret scan (gitleaks).
- AuthZ checks, zod validation, CSP, rate limits, etc.

---

## Phase 5 – Database & data layer (to do)

- Indexes, constraints, migration docs.

---

## Phase 6 – Testing (to do)

- API Vitest + supertest, front‑end RTL, Playwright smoke.

---

## Phase 7 – CI/CD (to do)

- `.github/workflows/ci.yml` with lint, typecheck, test, build, audit, gitleaks.

---

## Phase 8 – Performance (to do)

- Code‑split, manualChunks, Lighthouse.

---

## Commit Log (will be filled as we go)

| Commit | Message | Verified |
|--------|---------|----------|
| (pending) | fix(vercel): run full build for API bundle | |
| (pending) | fix(api): bundle API for Vercel function | |
| (pending) | feat(env): add zod env validation | |
| (pending) | feat(api): add /api/readyz | |
| (pending) | feat(frontend): improve ErrorBoundary fallback UI | |
| (pending) | chore(vercel): add CSP headers | |

---
*End of FIX_LOG.md (Phase 0‑1 captured). Next steps: implement Phase 1 fixes.*