# Contributing to HackathonOS

Thank you for considering a contribution. This document explains how to set up the project, our conventions, and the review process.

---

## Development Setup

### Prerequisites

- **Node.js 24.x** (see `engines` in root `package.json`)
- **pnpm 11.17.0** (see `packageManager` in root `package.json`)
- **PostgreSQL** (local, Neon, Supabase, or Vercel Postgres)
- **Clerk account** (free tier)

### Clone & Install

```bash
git clone https://github.com/Adib-07/HackathonOS.git
cd HackathonOS
pnpm install --frozen-lockfile
```

### Environment Files

**Root `.env`** (API server):

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/hackathonos
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
PORT=8080
NODE_ENV=development
```

**Frontend `artifacts/hackathon-os/.env`**:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
BASE_PATH=/
VITE_CLERK_PROXY_URL=http://localhost:8080/api/__clerk
```

### Database

```bash
cd lib/db
pnpm run migrate   # or pnpm run push for dev-only schema sync
```

### Run Dev Servers

**Terminal 1 — API**:

```bash
cd artifacts/api-server
PORT=8080 DATABASE_URL=... CLERK_SECRET_KEY=... CLERK_PUBLISHABLE_KEY=... pnpm run dev
```

**Terminal 2 — Frontend**:

```bash
cd artifacts/hackathon-os
PORT=19678 BASE_PATH=/ API_PROXY_ORIGIN=http://127.0.0.1:8080 pnpm run dev
```

Open `http://localhost:19678`.

---

## Branch & Commit Conventions

### Branches

| Type     | Prefix      | Example                             |
| -------- | ----------- | ----------------------------------- |
| Feature  | `feat/`     | `feat/add-retrospective-phases`     |
| Fix      | `fix/`      | `fix/csp-script-src`                |
| Docs     | `docs/`     | `docs/update-api-reference`         |
| Refactor | `refactor/` | `refactor/planner-task-sorting`     |
| Test     | `test/`     | `test/add-evidence-component-tests` |
| Chore    | `chore/`    | `chore/upgrade-vite`                |

### Commits (Conventional Commits)

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `revert`

**Scopes**: `api`, `fe`, `db`, `intel`, `workflow`, `auth`, `deploy`, `docs`

**Examples**:

```
feat(workflow): add retrospective unlock when deadline passes

Retrospective stage now unlocks when all submission tasks are done
OR the competition deadline has passed. Updated tooltip text in
sidebar and workflow page.

Closes #42
```

```
fix(api): reject evidence containing API keys

Added SECRET_PATTERNS to evidence.ts; returns 400 with clear message
when summary, commandName, sourceUrl, or reviewerNote contains a
credential-like string.
```

---

## Pull Request Checklist

Before opening a PR, ensure:

- [ ] **Typecheck passes**: `pnpm run typecheck` (runs `tsc --build` + per-package)
- [ ] **Tests pass**: `pnpm test` (all workspaces)
- [ ] **Build succeeds**: `pnpm run build` (produces `artifacts/hackathon-os/dist/public` + `api/bundle.mjs`)
- [ ] **No secrets**: No `sk_`, `pk_`, `AKIA`, `ghp_`, `xoxb-`, `-----BEGIN PRIVATE KEY-----`, JWTs in code or `.env` files
- [ ] **Conventional commit** messages on all commits in the PR
- [ ] **Scoped changes**: One logical change per PR; split large refactors
- [ ] **Updated docs** if behavior changed (README, API reference, workflow docs)

### CI Pipeline (when GitHub Actions exist)

The following will run automatically on PR:

1. `pnpm install --frozen-lockfile`
2. `pnpm run typecheck`
3. `pnpm test`
4. `pnpm run build`

---

## Code Style

- **TypeScript**: Strict mode (`"strict": true` in `tsconfig.json`)
- **ESLint**: Not yet configured; follow existing patterns
- **Prettier**: `pnpm prettier --write .` (config in root)
- **Imports**: Use `@/` alias for `artifacts/hackathon-os/src`; `@workspace/*` for libs
- **Components**: Functional, `export default`, colocated tests in `__tests__/` or `test/`
- **API routes**: One file per resource group (`competitions.ts`, `evidence.ts`, `intel.ts`)
- **Database**: Drizzle schema in `lib/db/src/schema/*.ts`; migrations in `lib/db/drizzle/`

---

## How to Add a Lifecycle Stage

1. **Update `PlanTaskPhase`** in `artifacts/hackathon-os/src/lib/workflow.ts`:

   ```typescript
   export type PlanTaskPhase =
     | "intake"
     // ... existing
     | "my_new_phase";
   ```

2. **Add phase label** in `PHASE_LABELS` (same file):

   ```typescript
   export const PHASE_LABELS: Record<PlanTaskPhase, string> = {
     // ...
     my_new_phase: "My New Phase",
   };
   ```

3. **Add stage definition** in `LIFECYCLE_STAGES`:

   ```typescript
   export const LIFECYCLE_STAGES: StageDefinition[] = [
     // ... existing
     {
       id: "my_stage",
       label: "My Stage",
       phases: ["my_new_phase"],
       summary: "What this stage covers.",
       planned: false, // or true if no persisted source yet
     },
   ];
   ```

4. **Update `StageId` union** if new stage:

   ```typescript
   export type StageId = "intake" | "research" | ... | "my_stage";
   ```

5. **Add unlock logic** in `buildStageSummaries` if stage has special rules (like Retrospective).

6. **Add tests** in `artifacts/hackathon-os/test/workflow.test.mjs`:
   - Verify stage appears in summaries
   - Verify unlock/lock behavior
   - Verify phase-to-stage mapping

7. **Update documentation**: `README.md` Workflow table, `docs/workflow.md`.

---

## How to Add an API Route

1. **Define Zod schemas** in `lib/api-zod/src/generated/` (or add to Orval config and regenerate):
   - Request body: `CreateXBody`, `UpdateXBody`
   - Params: `XParams`
   - Response: `XResponse`, `XListResponse`

2. **Add route handler** in `artifacts/api-server/src/routes/`:
   - Create new file (e.g., `my-resource.ts`) or extend existing
   - Use `requireAuthenticatedUser` middleware
   - Validate with `Schema.safeParse(req.body/params)`
   - Return `400` on validation error, `404` on not found, `401` on auth

3. **Register router** in `artifacts/api-server/src/routes/index.ts`:

   ```typescript
   import myResourceRouter from "./my-resource";
   router.use(requireAuthenticatedUser, myResourceRouter);
   ```

4. **Add database schema** in `lib/db/src/schema/` if new tables needed:
   - Create `my-resource.ts` with `pgTable`, indexes, `createInsertSchema`
   - Export from `lib/db/src/schema/index.ts`
   - Run `pnpm --filter @workspace/db run generate && pnpm --filter @workspace/db run migrate`

5. **Regenerate API client** (if using Orval):

   ```bash
   cd lib/api-spec
   pnpm run generate  # or whichever script Orval uses
   ```

6. **Add tests** in `artifacts/api-server/test/`:
   - Unit: planner, validation, verification logic
   - Integration: full request/response cycles against test DB

7. **Update OpenAPI spec** (auto-generated via Orval) and `docs/api.md`.

---

## How to Report Bugs

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md). Include:

1. **Environment**: Node version, pnpm version, OS, deployment (local/Vercel)
2. **Steps to reproduce**: Minimal, exact sequence
3. **Expected vs actual behavior**
4. **Logs/screenshots**: Console errors, network failures, CSP violations
5. **Related code**: File paths, line numbers if known

---

## Questions?

Open a [GitHub Discussion](https://github.com/Adib-07/HackathonOS/discussions) or [Issue](https://github.com/Adib-07/HackathonOS/issues).
