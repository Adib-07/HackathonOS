# HackathonOS Project Status

Updated: October 22, 2026
Repository: https://github.com/Adib-07/HackathonOS
Branch: `main` · Verified commit: `1306a74` (`feat: add competition workspace creation and persistence`)
Working tree: Phase 5 through Phase 9 changes applied, **not committed and not pushed**.

## Product goal

HackathonOS is a private, reusable workspace for organizing competition requirements, planning work against deadlines, tracking task progress, and keeping verification claims evidence-based. It must work across different events rather than assume one fixed competition.

## Current stage

**The product now has a research and idea intelligence engine, and it tells the truth about how well supported each statement is.**

The engine runs the full arc: **Competition → Problem analysis → Research → Opportunities → Ideas → Scoring → Build brief**. Every artefact it produces carries a claim kind, so a reader can always tell a fact from an inference:

| Claim kind | Meaning |
| --- | --- |
| `VERIFIED_FACT` | Read directly out of the stored competition record. True as long as that record is. |
| `SOURCE_SUPPORTED` | Backed by a source that was actually retrieved, with the URL and the retrieval time recorded. |
| `INFERENCE` | Derived from the record or the findings. Plausible, but stated nowhere. |
| `HYPOTHESIS` | A guess the team still has to test. |
| `UNKNOWN` | Missing information. Nothing has been assumed in its place. |

The deterministic parts work with no provider at all: the analysis, the rubric arithmetic, the gap reporting, and the build brief all run from stored data. The AI portions are additive and clearly labelled, and the API refuses to let a model promote its own output to a verified fact.

This is still not a claim that every planned module is complete. Research automation, AI agents, external integrations, deployment providers, and the retrospective module remain unbuilt and are labelled as planned, not simulated. **All evidence is manually supplied or retrieved from a source the user can open** — nothing in this codebase runs a check on the user's behalf and reports that it did.

## Repository audit

| Area | Status | Evidence / limitation |
| --- | --- | --- |
| Git remote and branch | VERIFIED | `origin` = `https://github.com/Adib-07/HackathonOS.git`, branch `main`, `origin/main` up to date at `1306a74`. Two clones share this remote; the workspace-root clone holds the uncommitted Phase 5 + Phase 6 work and is the one that was changed. The second clone at `~/CSE-AI & ML/HackathonOS` was inspected and left untouched. |
| Secret hygiene | VERIFIED | `.env`, `.env.*` are git-ignored (`.gitignore:52-54`, `!.env.example` retained). No `.env`, credential, or dump file exists in any commit in the full history (`git log --all --full-history` over `**/.env*`, `**/secrets*`, `**/credentials*` returned nothing). No `pk_`/`sk_` key material is tracked. |
| Competition workspaces | VERIFIED_WORKING | Create, list, read, update, and delete-by-owner scoping exercised over HTTP and through the real browser UI. 19/19 API checks and 12/12 browser-flow checks passed. |
| Deadline planner | VERIFIED_WORKING | Plan generation returns versioned plans with tasks; 12 tasks generated; plans and task counts survive a server restart. Planner logic has 4 unit tests. |
| Lifecycle / workflow view | VERIFIED_WORKING | **New in Phase 6.** `/competitions/:id/workflow` derives 8 stages from saved `workflow_tasks.phase` + `status`. All 12 tasks of a generated plan are accounted for across stages (2+1+2+2+2+1+1+1 = 12), verified by query and by DOM inspection. |
| Stage honesty | VERIFIED_WORKING | A stage with no saved tasks reads *Not started*; one with only `todo` tasks reads *Scheduled*; only a stage whose tasks are all `done` reads *Complete*; a blocked task always wins over completion. Enforced by unit tests. |
| Verification evidence | VERIFIED_WORKING | **New in Phase 7.** Evidence is persisted in `workflow_evidence`, ownership is enforced on every read and write, cross-owner access returns `404`, and a task reports *Verified* only when its phase's required evidence types all have passing, current, non-stale records. Proven by 24 unit tests, 17 API integration tests, and browser verification of the full Done → Verified → Done → Verified lifecycle. |
| Evidence provenance | VERIFIED_WORKING | Every record is stored with `source: "manual"`. A client-supplied `source` is rejected or coerced to manual. Credential-shaped content is rejected with `400`. Verified in the browser and the test suite. |
| Database migrations | VERIFIED_WORKING | **New in Phase 7.** Two reviewed, purely additive migration files with a generated journal. Applied to a disposable database with seeded records; all records survived. Applied to the development database; re-running is a no-op. |
| Authentication | VERIFIED_WORKING | Clerk session is the only production identity source. Unauthenticated list/create/overview requests return `401`. Cross-owner read and write return `404`. |
| Database | VERIFIED_WORKING | PostgreSQL via Drizzle. Rows confirmed by direct `psql` query after browser creation. Data survives a full API server restart. |
| Frontend ↔ API wiring | FIXED | `vite dev` had no `/api` proxy, so the documented local dev flow could not reach the API outside Replit. A dev-only proxy was added. |
| Production DB configuration | FIXED | `lib/db` silently fell back to `localhost` when `DATABASE_URL` was unset. Production now fails fast. |
| Dialog accessibility | FIXED | The create-competition modal had no focus management, no Escape handling, and no focus trap. It now uses a dedicated accessible `Dialog` component. |
| Form error accessibility | FIXED | Field errors are now linked to their control with `aria-describedby` and `aria-invalid`, and focus moves to the first invalid field. |
| Responsive layout | VERIFIED | No horizontal overflow at 1440px, 768px, or 390px on any page. |
| Text contrast | VERIFIED | 0 WCAG AA failures across 27–28 sampled text styles on all five pages (worst measured 4.5:1). 8 genuine failures were found and fixed. |
| Research, AI, uploads, idea evaluation, deployment, pitch/submission, retrospective | MISSING | No live integrations or complete workflows. Must not be presented as connected or working. The retrospective and settings stages are shown as *planned*. |
| Verification ledger | PARTIALLY_IMPLEMENTED | The overview still shows checks as `not_run` by design. This document is the evidence record, not the in-app ledger. |
| Lint, E2E, CI | MISSING | No lint command, no browser E2E suite in CI, and no CI workflow file. |
| Production deployment | BLOCKED | A live deployment exists but serves a build that predates the competition feature. Details in "Deployment readiness". |

## Security review findings

### Fixed in this stage

1. **Test identity bypass was reachable outside tests.** `artifacts/api-server/src/middlewares/auth.ts` honoured the `x-test-user-id` header whenever `NODE_ENV === "test"` **or** `TEST_AUTH_HEADER === "1"`. Because `TEST_AUTH_HEADER` was a plain environment flag, a production deployment that set it (or a misconfigured one that inherited it) would let any caller impersonate any owner by sending a header. The bypass is now gated on `NODE_ENV === "test"` only. **Verified:** a production-mode server with `TEST_AUTH_HEADER=1` returns `401` for `GET /api/competitions` with `x-test-user-id: attacker-user`.
2. **Silent localhost fallback for the database in production.** `lib/db/src/index.ts` and `lib/db/drizzle.config.ts` both used `process.env.DATABASE_URL || "postgresql://localhost:5432/hackathon_os"`. A production process started without `DATABASE_URL` would silently try to connect to localhost instead of failing, producing confusing runtime errors and hiding a deployment misconfiguration. Both files now throw in production when `DATABASE_URL` is missing, and warn (never silently fall back) outside production. **Verified:** `NODE_ENV=production` without `DATABASE_URL` exits with `Error: DATABASE_URL environment variable is required in production but was not provided.`
3. **API started in production without Clerk keys.** `artifacts/api-server/src/app.ts` logged a warning and mounted no Clerk middleware, so every authenticated route answered `401` for every user — a silent sign-in outage. Production now throws at startup when neither `CLERK_SECRET_KEY` nor `CLERK_PUBLISHABLE_KEY` is set. **Verified:** production start without Clerk keys exits with the explicit error.

### Confirmed sound

- **Ownership is enforced server-side.** The owner id comes only from the Clerk session; the browser never sends one. `findOwnedCompetition` filters on `id` **and** `ownerId`. Plan and task routes join back to `competitions.ownerId`.
- **Cross-owner access is blocked.** Owner B's list excludes owner A's competitions; direct `GET`, `PATCH`, and plan generation against owner A's competition id return `404` (not `403`, so ids are not enumerable).
- **Unauthenticated requests are rejected.** `GET /api/competitions`, `POST /api/competitions`, and `GET /api/overview` return `401` from the real server, from curl, and from an in-browser `XMLHttpRequest`.
- **No credential values are logged.** `pino` redacts `authorization`, `cookie`, and `set-cookie`. The request serializer logs only method, path, and status. No connection string is logged.
- **SQL injection is not reachable.** All queries go through Drizzle's parameterized builder. Probes with `' OR '1'='1`, `; DROP TABLE competitions--`, and path traversal payloads returned `400`/`404`; the schema was intact afterwards.
- **Stored XSS is not reachable.** A `<script>` payload submitted as a competition name is stored verbatim (correct for a data field) and rendered as escaped text. `window.__XSS_MARKER__` stayed `undefined` and the element had zero child elements. The only `dangerouslySetInnerHTML` in the codebase is in `components/ui/chart.tsx`, which renders static theme values and is not used by any application screen.
- **Production fails closed.** A production server with no Clerk keys and no session rejects all private routes with `401`; it never serves data.
- **No CORS headers are emitted.** The API sends no `Access-Control-Allow-Origin`, so browsers block cross-origin reads by default. The `cors` package is a declared dependency but is not wired in.

### Accepted, documented risk

- **`braces` 3.0.3 (CVE-2026-93687, high).** Stack exhaustion through deeply nested brace patterns. The advisory lists patched versions as `>=3.0.4`, but **no such release exists on npm** — `registry.npmjs.org/braces` shows `latest: 3.0.3` and `GET /braces/3.0.4` returns `404`. The GitHub advisory also states "Patched versions: None". It reaches the app through `http-proxy-middleware` → `micromatch` → `braces` (API) and `fast-glob` → `micromatch` → `braces` (mockup-sandbox build tooling).
  - **Exploitability in this app is nil.** The only reachable call site is `matchPathFilter` in `http-proxy-middleware`, and it only invokes `micromatch` when the configured `pathFilter` is a glob. `clerkProxyMiddleware` sets no `pathFilter` (default `/`, a plain string) and mounts the proxy at a fixed path, so the glob branch is never taken. The pattern is also never derived from user input. Confirmed with `isGlob("/") === false`.
  - **Not fixable by upgrade.** `micromatch` has no release without `braces`; `http-proxy-middleware` 4.2.0 is the newest version. Revisit when `braces` 3.0.4 ships.
- **All evidence is manually supplied or retrieved from a public source.** There is no machine runner. A passing `TEST_RESULT` means the owner asserted it. The UI labels every record accordingly.
- **Research providers are unauthenticated public APIs.** Wikipedia and arXiv have no published rate limit; GitHub's unauthenticated search allows 60 requests per hour per IP. The engine caps research at 8 searches per minute per process, and a provider that is rate limited is reported as failed with the reason.
- **The AI rate limit is per process.** It protects one instance, not a fleet. A multi-instance deployment needs a shared limiter.
- **No rate limiting and no security headers** on the API. `helmet` and `express-rate-limit` are not present. Acceptable for a single-user private workspace behind Clerk, but it should be revisited before the app is exposed publicly.
- **CSP is not configured.** `index.html` loads Google Fonts and Clerk's script from a third-party origin.

## Database configuration findings

| Item | Finding |
| --- | --- |
| Local development | Uses a local PostgreSQL 16 instance at `postgresql://localhost:5432/hackathon_os`. Confirmed reachable; the `competitions`, `workflow_plans`, and `workflow_tasks` tables exist. |
| Production | `DATABASE_URL` is now **required**; the API and the Drizzle config both throw when it is missing under `NODE_ENV=production`. |
| Fallback behaviour | Outside production a missing `DATABASE_URL` logs a warning and falls back to localhost. It is never silent, and it never happens in production. |
| Connection strings | Never logged. The only server log lines are the level, timestamp, pid, hostname, request method, path, status, and response time. |
| Migrations | **Phase 7 added a real migration history.** `lib/db/drizzle/` now holds two reviewed, purely additive SQL files plus `meta/_journal.json`. `drizzle-kit generate` writes them; `drizzle-kit migrate` applies them in order and records each in `drizzle.__drizzle_migrations`. `drizzle-kit push` is no longer the production mechanism. |
| `push` in automation | `drizzle-kit push` was previously the only mechanism and it is authoritative — it **removed** an extra column that was not in the schema, so it can drop data on drift. It remains available for local exploration only. **Production must use `migrate`.** Phase 9 changed `scripts/post-merge.sh` to run `migrate:baseline` then `migrate`; a regression test now fails if any deployment path runs `drizzle-kit push` again. |
| Monorepo compatibility | Preserved. `lib/db` keeps its existing `exports` map, its `drizzle.config.ts` location, and its `push`/`push-force` scripts. `drizzle-kit generate`, `migrate`, and `push` all still resolve the config. |
| Verified schema | `competitions` (17 columns, `owner_id` indexed with `deadline`), `workflow_plans` (FK to `competitions` with `ON DELETE CASCADE`, unique index on `(competition_id, version)`), `workflow_tasks` (FK to both parents, `ON DELETE CASCADE`), and `workflow_evidence` (16 columns, FK to `competitions` with `ON DELETE CASCADE`, FK to `workflow_tasks` with `ON DELETE SET NULL`). |

## Evidence model and API behaviour

### The five task states

| State | Meaning |
| --- | --- |
| `not_started` | The work has not begun. |
| `in_progress` | The work is under way but not finished. |
| `blocked` | The work cannot continue until a blocker is resolved. |
| `done` | The owner says the work is finished. **No proof.** |
| `verified` | The work is finished **and** evidence satisfies the task's own verification requirement. |

`DONE` is never treated as `VERIFIED`. A task only becomes verified when explicit evidence exists, that evidence matches the requirement recorded for the task, and nothing contradicts it.

### The evidence record

New table `workflow_evidence` (`lib/db/src/schema/evidence.ts`):

| Column | Purpose |
| --- | --- |
| `id` | Primary key. |
| `competition_id` | Owning competition. `ON DELETE CASCADE`. |
| `task_id` | The task row the evidence was recorded against. `ON DELETE SET NULL` — the record survives plan recalculation and becomes orphaned rather than being destroyed. |
| `task_key` | Stable task identity (e.g. `build-product`). Verification groups by this, so evidence survives a new plan version. |
| `type` | One of `TEST_RESULT`, `BUILD_RESULT`, `DEPLOYMENT_URL`, `HTTP_CHECK`, `MANUAL_REVIEW`, `SUBMISSION_CONFIRMATION`. |
| `summary` | What was observed. |
| `source_url` | Where it came from, when applicable. |
| `command_name` | The check or command name, when applicable. |
| `result` | `passed` or `failed`. |
| `observed_at` | When the check was actually observed. |
| `reviewer_note` | Optional reviewer context. |
| `source` | Provenance. **Always `manual`** today. |
| `phase_snapshot` | The task's phase when the evidence was recorded. |
| `verification_method_snapshot` | The task's stated verification method when the evidence was recorded. |
| `created_at` / `updated_at` | Audit timestamps. |

The two snapshot columns are what make staleness detectable: if the task's requirement later changes, older evidence no longer answers the right question and is reported as **stale**.

### Provenance: manual, always

There is no machine runner in this codebase. The API therefore:

- **Never accepts client-supplied provenance.** `source` is not in the request schema, and the server hard-codes `manual`. A client sending `source: "machine"` is either rejected (`400`) or stored as `manual`. **Verified in the browser and in the test suite.**
- **Labels every record as manually supplied.** The UI shows a `MANUALLY SUPPLIED` tag on every entry, and the form states that the entry is the user's own record.
- **Rejects credential-shaped values.** `summary`, `commandName`, `sourceUrl`, and `reviewerNote` are scanned for live-key patterns (`sk_live_`/`sk_test_`, `pk_live_`/`pk_test_`, AWS `AKIA…`, GitHub `ghp_…`, Slack `xox…`, PEM private keys, JWTs) and rejected with `400`. **Verified for three patterns in the browser.**

### Verification rules (server-authoritative)

Implemented in `artifacts/api-server/src/lib/verification.ts` as pure functions, and returned with every task so the client never re-derives them.

1. A **blocked** task is `blocked`. No evidence lifts that.
2. A task that is **not done** stays `not_started` or `in_progress`. Evidence alone does not verify unfinished work.
3. A **done** task with no satisfying evidence is `done`, with a reason explaining what is missing.
4. A **done** task becomes `verified` only when **every** required evidence type has a passing, current, non-stale record.
5. A **failed** required record blocks verification, even if another record of the same type passed — unless the failure has been superseded by a newer passing record.
6. A record is **superseded** when a newer record of the same type exists. The newest observation is the current truth.
7. A record is **stale** when `verification_method_snapshot` no longer matches the task's current verification method. Stale records stay visible but cannot verify anything.
8. A task is **never verified** by an evidence type its phase does not require.

Required evidence by phase:

| Phase | Required evidence |
| --- | --- |
| `intake`, `problem`, `research`, `track_selection`, `idea_selection`, `specification`, `architecture`, `security`, `demo`, `pitch` | `MANUAL_REVIEW` |
| `implementation` | `BUILD_RESULT` **and** `TEST_RESULT` |
| `testing` | `TEST_RESULT` |
| `deployment` | `DEPLOYMENT_URL` **and** `HTTP_CHECK` — a deployment URL alone never proves the application works |
| `submission` | `SUBMISSION_CONFIRMATION` |
| any unknown phase | `MANUAL_REVIEW` (never verifiable by default) |

### API behaviour

| Route | Behaviour |
| --- | --- |
| `GET /api/competitions/:competitionId/evidence` | Lists the caller's evidence for a competition. `404` for another owner's competition (not `403`, so ids are not discoverable). `401` without a session. |
| `POST /api/competitions/:competitionId/tasks/:taskId/evidence` | Records evidence against a task. `404` if the task is not the caller's. `400` for a missing field, an unsupported type, an invalid result, a future observation time, or credential-shaped content. `201` on success. |
| `DELETE /api/competitions/:competitionId/evidence/:evidenceId` | Removes a record so the owner can re-verify after fixing a failure. Ownership is checked **before** the delete. `404` for another owner's record. |

Every task response (`GET /api/overview`, `GET /api/competitions/:id/plans/:planId`, `PATCH .../tasks/:taskId`, and plan generation) now carries a `verification` object with the derived state, the required/satisfied/missing/failed types, the supporting evidence ids, and a human-readable reason.

### Evidence limitations

- **Every record is a human assertion.** There is no automated runner, no CI integration, and no deployment probe. A passing `TEST_RESULT` means *the owner said the tests passed*. The UI says "Manually supplied" on every record for exactly this reason.
- **Verification is recomputed on every read** from the evidence rows, so a stale `verified` flag can never survive a change to the task or its requirement.
- **The evidence itself is not a trust anchor.** It is an auditable record of what the owner observed, with timestamps and provenance. It does not cryptographically prove the observation.
- **A deployment URL is necessary but never sufficient** for a deployment task; an `HTTP_CHECK` against it is also required.
- **`MANUAL_REVIEW` is the fallback** for phases with no machine-checkable requirement, and it is labelled as a manual review.
- **Evidence does not carry across to a different `taskKey`.** Recalculating a plan preserves the task keys, so evidence still applies; changing what a task means invalidates it through the snapshot check.

## Migration commands and procedures

### The migration files

| File | Content | Destructive? |
| --- | --- | --- |
| `lib/db/drizzle/0000_baseline_existing_schema.sql` | Creates `competitions`, `workflow_plans`, and `workflow_tasks` exactly as they already exist. | **No.** Only `CREATE TABLE`, `ADD CONSTRAINT`, `CREATE INDEX`. |
| `lib/db/drizzle/0001_add_workflow_evidence.sql` | Creates `workflow_evidence` and its two indexes. | **No.** Only `CREATE TABLE`, `ADD CONSTRAINT`, `CREATE INDEX`. |

A scan of every migration for `DROP`, `TRUNCATE`, `ALTER COLUMN … TYPE/DROP NOT NULL`, `DELETE FROM`, and `RENAME` returns **nothing**. Every migration is purely additive.

The baseline was verified against the live development database with `pg_dump --schema-only`: the three tables and five indexes in the baseline match the live schema exactly, so adopting the baseline on an existing database is a no-op in effect.

### Commands

| Command | Purpose |
| --- | --- |
| `pnpm --filter @workspace/db run generate` | Writes a new migration from the schema diff. Review the SQL before applying it. |
| `pnpm --filter @workspace/db run migrate` | Applies pending migrations in order. Idempotent. |
| `pnpm --filter @workspace/db run migrate:baseline` | Records the baseline as applied **without executing its SQL**. Required once on a database that was created with `drizzle-kit push`. |
| `pnpm --filter @workspace/db run test:migrations` | Applies the migrations to a throwaway database and asserts records survive. |

### Local development procedure

```bash
# 1. Apply pending migrations to the development database.
pnpm --filter @workspace/db run migrate

# 2. After changing lib/db/src/schema, generate and REVIEW the SQL.
pnpm --filter @workspace/db run generate
cat lib/db/drizzle/000N_*.sql     # review before committing

# 3. Apply it.
pnpm --filter @workspace/db run migrate
```

`drizzle-kit push` remains available for quick local exploration only. It is authoritative over the schema and can drop data, so it must not be used against production.

### Production procedure

```bash
# 1. BACK UP THE DATABASE FIRST. This is required, not optional.
pg_dump --format=custom --file=backup-$(date +%Y%m%d-%H%M%S).dump "$DATABASE_URL"

# 2. If the database was created with `drizzle-kit push` (no migration history),
#    record the baseline as applied. It refuses to run if the baseline tables
#    are absent, so it can never silently skip a needed migration.
pnpm --filter @workspace/db run migrate:baseline

# 3. Apply the pending migrations.
pnpm --filter @workspace/db run migrate
```

`migrate:baseline` is idempotent and refuses to run against a database that does not already contain the baseline tables, so it cannot be used to skip a migration that genuinely needs to run.

**`scripts/post-merge.sh` now runs `migrate:baseline` and then `migrate`.** The destructive `push` path is gone from every deployment script, and a regression test fails if it returns.

### Recovery requirements

- **A verified backup must exist before any migration runs.** `pg_dump --format=custom` is sufficient for a full restore with `pg_restore --clean --if-exists`.
- **Restoring a backup reverts the schema as well as the data.** After a restore, the migration ledger may be ahead of the schema, so re-run `migrate` after restoring to reconcile.
- **Migrations are not automatically reversible.** There are no `down` migrations. Recovery is by restore, which is why the backup is mandatory.

### Migration verification performed

`pnpm --filter @workspace/db run test:migrations` creates a throwaway database, applies the baseline, seeds two competitions, two plans, and three tasks, applies `0001`, and asserts:

- All pre-existing rows survive (2:2:3 before and after)
- `workflow_evidence` is created with 16 columns
- Deleting a task sets the evidence `task_id` to NULL instead of destroying the record
- Deleting a competition cascades to its evidence
- Unrelated owners' records are untouched

The disposable database is dropped at the end. The development database was migrated with the real `migrate` command and the migration ledger now shows both migrations, and re-running `migrate` is a no-op.

## Research and idea intelligence engine

### What was actually built

| Module | Where | Works without an AI provider? |
| --- | --- | --- |
| **A. Problem analysis** | `lib/intel/problem-analysis.ts` | **Yes.** Reads the stored record and produces verified facts, missing fields, and unanswered questions. The model may only *add* inferences. |
| **B. Research engine** | `lib/intel/research.ts` | **Yes.** Queries three live, keyless, documented public APIs. |
| **C. Gap analysis** | `lib/intel/gaps.ts` | **Yes.** Builds conservative opportunities from the findings and states where the evidence runs out. |
| **D. Idea generation** | `lib/intel/ideas.ts` | **No.** Requires a provider; the API returns a clear configuration error otherwise. |
| **E. Idea scoring** | `lib/intel/ideas.ts` | **Yes.** The rubric arithmetic, weights, totals, and sensitivity are pure and deterministic. The model may only propose scores. |
| **F. Build brief** | `lib/intel/gaps.ts` | **Yes.** Built from the selected idea, reporting the sections it could not fill. |

The interface is `/competitions/:id/intel`, a five-step flow: **Problem → Research → Opportunities → Ideas → Build brief**. It is linked from the competition detail page.

### Real external research: yes, and it was verified

No research provider was configured, so three **keyless, documented, public** APIs were integrated. All three were confirmed reachable and returning genuine results before any code was written:

| Provider | Endpoint | What it finds |
| --- | --- | --- |
| **Wikipedia** | MediaWiki `api.php` search | Encyclopaedia articles: existing products, background |
| **arXiv** | `export.arxiv.org/api/query` | Published research |
| **GitHub** | `api.github.com/search/repositories` | Open-source repositories |

**Verified live through the API and through the browser UI:** a search for "solar installer delivery quality" returned **15 findings across all three providers** with real URLs, titles, and excerpts. The URLs were fetched back and returned `200`. No citation, repository, benchmark, or paper is ever invented: a provider that fails is reported as failed in the UI, with the reason, rather than being papered over.

The UI shows, per finding: the provider, the source type, the claim kind, the retrieval timestamp, the query, and a link that opens the source.

### Real AI calls: the architecture is complete, no key is present

**No AI provider SDK was installed and no provider credential exists in this environment.** The only provider key names present are unrelated. So:

- **One** provider is integrated, not several: an OpenAI-compatible chat-completions client. It is the shape most gateways and self-hosted deployments expose, so it is the most broadly useful single choice.
- Configuration is entirely environment driven: `OPENAI_API_KEY` (required), `OPENAI_BASE_URL` (optional), `OPENAI_MODEL` (optional).
- **The key is read on the server only.** It is never sent to the frontend, never logged, and never returned in a response. It travels in the `Authorization` header, never in the request body.
- **Missing configuration produces an explicit, actionable error** (`503` with `code: "AI_NOT_CONFIGURED"` and the names of the missing variables), not a crash and not a fabricated result.
- **The provider boundary is an interface** (`AiProvider`). The engine depends on that interface, not on the vendor, so a different provider is one adapter, not a rewrite.
- **Timeouts** (45s default, abortable), **structured output validation** (JSON mode, with recovery from code fences and surrounding prose), and **graceful failure** (a malformed model response is a `MALFORMED_OUTPUT` error, never invented data).
- **Rate limits**: research searches are capped at 8/minute and AI calls at 12/minute per process.

**The AI path was proven end to end** by pointing the client at a local stand-in for the chat-completions endpoint. With a provider present, the whole arc works: an AI-assisted analysis produced 10 verified facts from the record plus 1 inference and 1 hypothesis from the model, correctly separated; idea generation returned a scoped candidate; scoring produced a total of 88.9 with a sensitivity range of 33.3–100; and the build brief filled all 19 sections and was saved against the right competition. **No live completion against a real provider was performed, because no credential exists.** That is stated plainly rather than implied.

### Rules that stop the engine overclaiming

- A model can never produce a `VERIFIED_FACT`. Its output is downgraded to `INFERENCE` on the way in.
- A gap with no supporting finding is forced to `HYPOTHESIS`.
- A score with no rationale gets an explicit "no rationale was provided" placeholder rather than a blank.
- A malformed score is **dropped**, not defaulted, so a broken response cannot inflate a total.
- The analysis names the fields the competition record does **not** contain (judging criteria, exclusions, pain points, required outcomes) instead of inventing them.
- The gap analysis states "no claim is made about which competitors exist" and lists what to investigate next.
- The idea prompt is scoped to the recorded remaining hours, team size, and skills, and requires each idea to state what it excludes and what it has not verified.
- The rubric reports the weakest dimensions and the sensitivity range alongside the total, so a weak dimension cannot hide behind a high aggregate.
- Scores are described as the team's own structured judgement, never as a prediction of a win.

### Schema and migration changes

Eight new tables, all additive and all scoped to a competition:

| Table | Purpose |
| --- | --- |
| `competition_analyses` | One analysis per competition, versioned. |
| `analysis_requirements` | The extracted requirements, individually editable and reviewable. |
| `research_findings` | Retrieved and manual findings, with source, time, and claim kind. |
| `research_gaps` | The identified opportunities and where the evidence runs out. |
| `idea_candidates` | The idea candidates and the team's decision. |
| `idea_evaluations` | One dimension score per idea, with rationale, evidence, and uncertainties. |
| `idea_rubrics` | The weights the team uses, per competition. |
| `build_briefs` | The saved build brief, as a structured document. |

Migration `lib/db/drizzle/0002_add_intel_engine_tables.sql` is reviewed and **purely additive**: only `CREATE TABLE`, `ADD CONSTRAINT`, and `CREATE INDEX`. A scan of all three migration files for `DROP`, `TRUNCATE`, `ALTER COLUMN`, `RENAME`, and `DELETE FROM` returns nothing.

The migration test was extended to assert that all eight tables are created, that `research_findings` is scoped to a competition, and that deleting a competition cascades to its findings. The full migration suite passes against a disposable database that is dropped afterwards.

## Phase 9 — deployment readiness and safe release

### The post-merge migration hazard: fixed

`scripts/post-merge.sh` previously ran the destructive schema-sync command.
`drizzle-kit push` is authoritative over the schema: it diffs the live
database against the TypeScript schema and applies the difference, so it can
**drop columns and tables** that are not in the schema. That behaviour was
demonstrated earlier in this project — a `push` removed a column that was not
in the schema.

The hook now runs the reviewed migration system:

```bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run migrate:baseline
pnpm --filter @workspace/db run migrate
```

The script's other necessary behaviour is preserved: it still installs
dependencies, it still fails loudly (`set -euo pipefail`), and it now pins
its own working directory (`cd "$(dirname "$0")/.."`), so it does not depend
on where the hook happens to invoke it.

**Regression evidence.** A new test file, `lib/db/test/migration-scripts.test.mjs`,
fails if the hook regresses. It asserts that the hook does not run
`drizzle-kit push`, that it runs `migrate:baseline` and `migrate`, that it
keeps its install step and its fail-fast behaviour, that it is executable,
and — by scanning **every** script, config, and package file in the repository
— that no other deployment path runs `drizzle-kit push`. The scan strips
comments first, so prose that *mentions* the command is not mistaken for a
command that *runs* it.

A second test asserts the documented deployment commands use `migrate`, and
that every mention of `push` in the documentation is a warning rather than an
instruction.

The `lib/db` package now has a `test` script, so these tests run under the
root `pnpm test` and cannot be skipped silently.

### Development schema synchronisation vs production migration

| | `drizzle-kit push` | `drizzle-kit migrate` |
| --- | --- | --- |
| What it does | Diffs the live database against the TypeScript schema and applies the difference | Applies reviewed SQL files in order, and records each one |
| Can it drop data? | **Yes.** It is authoritative over the schema. | **No.** Every migration in `lib/db/drizzle/` is additive. |
| Reviewable before it runs? | No. The diff is computed at run time. | Yes. The SQL is a committed file. |
| Repeatable? | Yes, but destructive if the schema and database disagree. | Yes. It records what it applied. |
| Use for | Local development only | The deployment |

`push` and `push-force` remain in `lib/db/package.json` for local
development. Nothing in a release path invokes them.

### Production baseline safety assessment

The production database has no migration history, because it was created with
`drizzle-kit push`. Recording the baseline is safe **only if** the live
schema already contains what the baseline creates.

The previous implementation checked only that the baseline *tables* existed.
That was not enough: a database missing a single column would have been
recorded as baselined, and the missing column would never have been applied.
Phase 9 closes that gap.

`lib/db/scripts/mark-baseline-applied.mjs` now:

1. **Parses the baseline migration** (`lib/db/scripts/schema-comparison.ts`)
   into the tables, columns, indexes, and foreign keys it creates.
2. **Reads the live schema** from `information_schema` and `pg_indexes`.
3. **Compares them structurally.** The comparison is a superset test: the
   baseline counts as applied when every table, column, index, and foreign key
   it creates is already present.
4. **Decides one of three ways:**
   - *Empty database* (no application tables) → nothing to record. `migrate`
     creates the schema from the migrations. Exits 0.
   - *Matches* → the baseline is recorded. Exits 0.
   - *Diverged* → **refused**, with the exact missing objects listed, and
     nothing written. Exits 1.
5. **Writes exactly one row** to `drizzle.__drizzle_migrations`. It never
   reads, writes, or alters an application table.
6. Is **idempotent** — a second run reports "already recorded" and changes
   nothing.

It also has a read-only `--check` mode (`migrate:baseline:check`) for a
preflight that writes nothing.

**The live schema is never assumed to match the development schema.** The
comparison is made against the *migration file*, not against the local
database, and the live database's extra objects are reported as drift rather
than being treated as an error — because migrations never drop, so an extra
column simply stays.

#### What was verified, and where

All of this was exercised against **disposable local databases**; the
production database was not touched.

| Scenario | Result |
| --- | --- |
| Empty database | "The database has no application tables. The baseline does not need to be recorded." Exit 0. |
| Schema matching the baseline | "The live schema matches the baseline exactly." Check mode wrote nothing (no `drizzle` schema created). |
| Schema matching, apply mode | Exactly **one** ledger row written. The pre-existing application row was untouched. |
| Migrations applied afterwards | Migrations `0001` and `0002` applied. The pre-existing application row survived. All 12 tables present. Three ledger rows. |
| Schema with a **dropped column** | **Refused**, exit 1: `column "competitions"."current_track"` is missing. No ledger row written. |
| Schema with an **extra column** | Baseline recorded; the extra object reported as drift and left in place. |
| Run twice | "already recorded. Nothing to do." No change. |

**Still required before production** — none of this can be done from here:

1. Take a verified backup: `pg_dump --format=custom --file=backup.dump "$DATABASE_URL"`.
2. Run the read-only preflight: `pnpm --filter @workspace/db run migrate:baseline:check`.
3. If it reports a match, record it: `pnpm --filter @workspace/db run migrate:baseline`.
4. Apply the migrations: `pnpm --filter @workspace/db run migrate`.
5. If it reports a divergence, **stop**. Do not force it. Reconcile the schema
   with a new reviewed migration first.

**Assumptions that must be confirmed against the real database:** the
production schema was created from the same TypeScript schema as the baseline
migration; the production database user can read the catalog; and the
production database is reachable from wherever the migration runs. The
preflight is designed to answer the first assumption with evidence rather
than an assumption.

**Not verified:** the actual production schema. The preflight has never been
run against it, because doing so would mean connecting to production.

### The stale production deployment

**Confirmed observations** (read-only probes on
`https://hackathonos.replit.app`):

| Probe | Result |
| --- | --- |
| `GET /` | `200` |
| `GET /api/healthz` | `200` |
| `GET /api/competitions` | `404` |
| `GET /api/overview` | `404` |
| `GET /api/__clerk/v1/environment` | `404` |
| Deployed web bundle | `assets/index-wB5QVmxO.js` — unchanged since Phase 6 |
| `x-powered-by` on `/api/healthz` | `Express` |

The `404` bodies are Express's own `Cannot GET /api/competitions` page with
`content-type: text/html`. **That is a route miss inside a working Express
app, not a static-file miss**: the same origin, the same process, answers
`/api/healthz` with `200`. The current local build contains the
`/competitions` route (verified in the built bundle).

**Therefore, confirmed:** the API process is running, it is mounted at
`/api`, and its router does not include the competitions routes. The
deployed API binary predates the commit that added them (`80df6be`).

**Hypotheses, not proven:**

- H1 — the Replit deployment is running a build from before `80df6be`;
- H2 — the Replit project has not been synced with the GitHub repository
  since then;
- H3 — the `paths = ["/api"]` service routing is not splitting correctly.

H3 is weakened by the evidence: if the path split were broken, `/api/healthz`
would fail too. H1 and H2 remain the leading explanations, and the
repository contains **no** GitHub Actions workflow, **no** Replit↔GitHub sync
configuration, and no other release automation — so a GitHub push is not
wired to a build.

**A route returning 404 is evidence that a route check failed. It is not
proof of one specific root cause.** The exact cause can only be confirmed
from the Replit side, by inspecting which commit the deployment was built
from.

### The exact safe deployment sequence

1. **Back up production**: `pg_dump --format=custom --file=backup-$(date +%Y%m%d-%H%M%S).dump "$DATABASE_URL"`. Verify the dump restores into a scratch database before continuing.
2. **Preflight the schema**: `pnpm --filter @workspace/db run migrate:baseline:check`. It writes nothing. If it reports a divergence, stop and write a reviewed migration for the difference.
3. **Configure the Replit secrets**: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, and `OPENAI_API_KEY` for the generative features. The API refuses to start without the first three, which is the intended fail-closed behaviour.
4. **Sync the Replit project with the intended commit.** The repository is mirrored *from* Replit; a GitHub push does not rebuild it. Pull the work into the Replit project and run a deployment from there.
5. **Let the post-merge hook apply the migrations.** It runs `migrate:baseline` (idempotent, refuses on divergence) and then `migrate` (additive only).
6. **Health check**: `GET /api/healthz` must return `200`. Then `GET /api/competitions` must return `401` (not `404`) — a `404` means the stale build is still serving.
7. **Smoke test with a real session**: sign in, create a competition, generate a plan, record evidence, and confirm the task reports *Verified*.
8. **Rollback** is by restore: there are no down migrations, so reverting a release means restoring the backup taken in step 1. A rollback that also needs the schema reverted must restore both the data and the schema from the same dump.

**Known risk in the hook:** `.replit` sets `[postMerge] timeoutMs = 20000`. The hook now runs `pnpm install --frozen-lockfile`, the baseline check, and the migrations. On a warm cache the last two took 0.3 s and 0.5 s respectively in this environment, so the added work is small — but `pnpm install` on a cold container could dominate. The pre-existing hook already had this exposure; Phase 9 did not make it materially worse, but it should be watched on the first real deploy.

### AI provider verification level

| Level | What it covers | Status |
| --- | --- | --- |
| **1. Verified by automated tests** | The key is read on the server and never enters the request body; the endpoint is the chat-completions path; timeouts and cancellation abort the request; upstream errors are credential-redacted; malformed structured output is rejected rather than fabricated; the rate limiter allows exactly 8 research and 12 AI calls per minute; model output cannot be promoted to `VERIFIED_FACT`; malformed scores are dropped rather than defaulted; the manual fallback works with no provider configured. | **11 + 5 + 43 + 29 tests pass.** |
| **2. Verified with a local stand-in** | The full arc — AI-assisted analysis, idea generation, scoring, and build brief — driven through the real provider client against a local stand-in for the chat-completions endpoint. | **Done.** The analysis produced 4 verified facts, 1 inference, and 1 hypothesis, correctly separated. |
| **3. Verified with a real provider** | The real OpenAI service, with a real credential, producing real model output. | **NOT VERIFIED.** No provider credential exists in this environment. |
| **4. Not yet verified** | Model output *quality* — whether the prompts produce good requirements, ideas, and briefs, and whether the scoring is a useful judgement. This can only be judged against a real model. | **Open.** |

Levels 1 and 2 are not level 3, and are not described as such anywhere.

### Dependency advisory reassessment

| | |
| --- | --- |
| Package | `braces` 3.0.3 |
| Advisory | GHSA-vfj7-8cjw-p6xm / CVE-2026-93687 (high) |
| Dependency paths | `artifacts/api-server` → `http-proxy-middleware` → `micromatch` → `braces`; `artifacts/mockup-sandbox` → `fast-glob` → `micromatch` → `braces` |
| Patched release available? | **No.** The npm registry's `latest` tag is still `3.0.3`; `braces@3.0.4` returns `404`. The GitHub advisory lists "Patched versions: None". |
| Can it be overridden away? | No. `micromatch` has no release without `braces`, and `http-proxy-middleware` 4.2.0 is the newest. |

**Exposure.** The vulnerable recursive walkers are reached only through
`micromatch`, which `http-proxy-middleware` calls **only when its configured
`pathFilter` is a glob**. `clerkProxyMiddleware` sets no `pathFilter` at all
(defaults to the plain string `/`) and is mounted at the fixed literal path
`/api/__clerk`. The filter is developer configuration, never request data, so
an attacker cannot supply the pattern.

**Why the current mitigation is sufficient.** The request path is never
interpreted as a brace pattern, so the vulnerable parser is never invoked
with attacker-controlled input. This was confirmed by sending a path
containing 4000 nested braces to a live production-mode server: the process
did not crash and kept serving (`/api/healthz` returned `200`).

**Why it is not merely "assumed".** `artifacts/api-server/test/dependency-braces.test.mjs`
pins the mitigation so it cannot silently stop holding. It asserts the
mounted path is not a glob, that the middleware configures **no** `pathFilter`
at all, and that a request path with 4000 nested braces leaves the server
serving. If someone later configures a glob path filter, the test fails.

**Residual risk.** The mitigation is a property of *this* configuration, not
of the dependency. A future change that introduces a glob path filter, or
another use of `micromatch` on user input, would make the advisory
reachable. The `mockup-sandbox` path is a build-time dependency and is not
reachable at runtime.

**Recorded as an explicit release risk**, not as a closed item. The
application is **not** claimed to be free of this advisory.

### Environment configuration audit

| Check | Result |
| --- | --- |
| `DATABASE_URL` required in production | **Yes.** `lib/db/src/index.ts` and `lib/db/drizzle.config.ts` both throw under `NODE_ENV=production`. Verified: production start exits with `DATABASE_URL environment variable is required in production`. |
| Clerk required in production | **Yes.** `artifacts/api-server/src/app.ts` throws when neither `CLERK_SECRET_KEY` nor `CLERK_PUBLISHABLE_KEY` is set. Verified: production start exits with the explicit error. |
| Clerk client key | `VITE_CLERK_PUBLISHABLE_KEY` is read at build time by the web app. Missing → the app throws `Missing VITE_CLERK_PUBLISHABLE_KEY in .env file`. |
| `OPENAI_API_KEY` server-side only | **Yes.** It is read only in `artifacts/api-server/src/lib/intel/openai-provider.ts`. `grep` finds no reference to it in `artifacts/hackathon-os/src/`. It travels in the `Authorization` header, never the body (asserted by a test). |
| Missing AI configuration | **Yes.** A clear `503` with `code: "AI_NOT_CONFIGURED"` and the missing variable *names*. The UI shows "No AI provider is configured, so ideas cannot be generated for you." |
| Secrets in logs | **No.** The API logs method, path, status, and duration only. `pino` redacts `authorization`, `cookie`, and `set-cookie`. The intel library contains no logging at all. |
| Secrets in error responses | **No.** Upstream error bodies are credential-redacted before they reach a response (asserted by a test). |
| Secrets committed | **No.** A scan of every tracked file for live-key patterns returns nothing. |
| Secrets in `.env.example` | **No.** Every value is empty or a documented local placeholder. |
| Deployment start command | `node --enable-source-maps artifacts/api-server/dist/index.mjs` with `PORT=8080`, `NODE_ENV=production`. **Verified booting**, serving `/api/healthz` `200` and rejecting unauthenticated routes with `401`. |
| Deployment build command | `pnpm --filter @workspace/api-server run build` → the esbuild bundle the start command consumes. **Verified.** |
| Deployment migration command | `migrate:baseline` then `migrate`, in `scripts/post-merge.sh`. **Verified** against disposable databases. |

No secret value was printed, requested, or written during this phase.

## Tests actually run and their results

All commands were executed in this session. No test was modified to make it pass.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS — lockfile resolved, 493 packages, no changes needed |
| `pnpm --filter @workspace/api-server run test` | PASS — 156 tests, 156 pass, 0 fail |
| `pnpm --filter @workspace/hackathon-os run test` | PASS — 40 tests, 40 pass, 0 fail (Phase 5: 12. Phase 6: 24. Phase 7: 4) |
| `pnpm --filter @workspace/db run test` | PASS — 17 tests, 17 pass, 0 fail (**new in Phase 9**: 8 migration-script tests, 9 schema-comparison tests) |
| `pnpm test` | PASS — 213 tests across three packages, 0 fail (baseline was 103) |
| `pnpm run typecheck` | PASS — libs, api-server, hackathon-os, mockup-sandbox, scripts all clean |
| `pnpm --filter @workspace/api-server run build` | PASS — esbuild bundle produced |
| `PORT=19678 BASE_PATH=/ pnpm --filter @workspace/hackathon-os run build` | PASS — 1836 modules, `dist/public` emitted |
| `PORT=19678 BASE_PATH=/ pnpm run build` | PASS — typecheck + api-server + web + mockup-sandbox builds |
| `pnpm --filter @workspace/db run test:migrations` | PASS — all three migrations applied to a disposable database; seeded rows survived; the intel tables and their cascades were asserted; the database was dropped afterwards |
| `pnpm --filter @workspace/db run migrate` | PASS — applied to the development database; re-running is a no-op |
| `pnpm --filter @workspace/db run migrate:baseline` | PASS — idempotent; a second run reported "already recorded" and changed nothing |
| `pnpm --filter @workspace/db run migrate:baseline:check` | PASS — read-only preflight; reported "The live schema matches the baseline exactly" and created no `drizzle` schema |
| `pnpm --filter @workspace/api-spec run codegen` | PASS — Orval regenerated the client and Zod schemas; a second run produced byte-identical output |
| `git diff --check` | PASS — clean (Phase 9 fixed the trailing blank lines in the generated client by adding a prettier pass to the codegen pipeline) |
| `pnpm audit` | PARTIAL — 1 high, 0 moderate, 0 low remaining. The remaining finding is `braces`; see "Dependency advisory reassessment". |
| Lint | NOT_CONFIGURED — no lint script exists in the workspace |

### Functional verification (executed, not asserted)

**API — real server process, real PostgreSQL.** A built `dist/index.mjs` was started as a separate process and driven over HTTP. 19/19 checks passed:

- `/api/healthz` is public (`200`); `/api/competitions` GET and POST without a session are `401`
- Missing `name` → `400`; missing or invalid `deadline` → `400`
- A valid competition is created (`201`), the name is trimmed, and `mandatoryDeliverables` / `teamSkills` round-trip as arrays
- The new competition appears in `GET /api/competitions` and in `GET /api/overview`
- Owner B's list excludes it; owner B's direct GET, PATCH, and plan-generation all return `404`
- Owner A's PATCH returns `200` and the new value is returned
- Plan generation returns `201` with 12 tasks

**Persistence across a real restart.** The server process was killed and restarted, then re-verified — 5/5 checks passed: the competition, its patched field, its detail record, and its plan version all survived, and owner isolation still held.

**Production configuration.** `NODE_ENV=production` without `DATABASE_URL` → exits with the explicit error. `NODE_ENV=production` with `TEST_AUTH_HEADER=1` → `x-test-user-id` is ignored and the request is `401`. `NODE_ENV=production` without Clerk keys → exits with the explicit error.

**Browser — the real React application.** The actual `artifacts/hackathon-os/src` app was rendered in a headless Chromium browser against the real API server and the real database, with only Clerk's identity provider stubbed (no Clerk credentials exist in this environment). All checks passed:

- Dashboard loads; the "New workspace" modal opens
- Submitting the empty form shows "Competition name is required." and "Submission deadline is required.", and both inputs are marked `aria-invalid="true"`
- A fully populated form submits → `POST /api/competitions → 201`, the success banner reads `Workspace "Browser Verified Hackathon 2026" created and saved to persistent database.`, and the row appears under "Saved Workspaces (1)"
- After a page refresh the competition is still shown; after a full **server** restart plus a refresh it is still shown
- `/competitions` lists it; `/competitions/:id` renders every field (organizer, deadline, format, team size, track, deliverables, skills, problem statement)
- The row was confirmed directly in PostgreSQL with the correct `owner_id`
- Owner isolation confirmed from the API against the browser session's owner
- In-browser `XMLHttpRequest` (bypassing the harness's fetch wrapper) → `401` for both GET and POST
- Browser console: **no errors** on load, on submit, after refresh, and on the competitions and detail pages. The only network entries were the expected `/api/overview`, `/api/competitions`, and `/api/healthz` calls, all `200`.

**Phase 6 — browser verification of the redesigned UI.** The real React app again, against the real API and database:

- **Dialog semantics:** the create dialog exposes `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, and `aria-describedby`.
- **Focus management:** opening the dialog moves focus to the first focusable control; **Escape** closes it and restores focus to the trigger button; background scroll is unlocked on close.
- **Focus trap:** 30 consecutive `Tab` presses kept focus inside the dialog.
- **Validation semantics:** submitting an empty form sets `aria-invalid="true"` and `aria-describedby="competition-name-error"` on the name input, renders the message in the referenced element, and moves focus to that input.
- **Duplicate submission prevented:** 5 rapid clicks on submit produced exactly **1** `POST /api/competitions` and exactly **1** database row.
- **Lifecycle states proven against the database:** a task set to `blocked` in the planner produced `data-stage-state="blocked"`, a `Blocked` section, `BLOCKED STAGES = 1`, and the blocker task named. A task set to `in_progress` produced `data-stage-state="active"` and moved the stage into "In progress and complete". The Overview `Blocked` metric and blocked banner both read `1`.
- **Task coverage:** the 8 stages summed to 12 tasks, matching the 12 rows in `workflow_tasks` — no task is invisible.
- **Persistence:** a competition saved on the detail page persisted to PostgreSQL (`Civic Tech Track B`); the planner's task-status change persisted (`in_progress`) and was reflected on the Workflow page.
- **Responsive:** `document.documentElement.scrollWidth === innerWidth` at 1440px, 768px, and 390px on every page, with zero overflowing elements.
- **Semantics:** every page has exactly one `h1`, one `main`, and labelled navigation; zero unlabelled buttons, zero unlabelled inputs, zero images without `alt`.
- **Contrast:** 0 WCAG AA failures on all five pages after fixes (worst measured 4.5:1).
- **Console:** zero errors and zero failed network requests across all five pages.

**Phase 7 — browser verification of the evidence engine.** The real React app against the real API and database:

- The evidence panel renders on all 12 tasks of a generated plan.
- A fresh task reads **Not started** with the reason "This task has not been started."
- Marking a task `done` moves it to **Done** with the reason "Still needs TEST_RESULT evidence to be verified." — done is not verified.
- Opening the panel shows the required evidence type with a **NEEDED** marker and the task's own verification method.
- Submitting evidence without the required command name shows "This evidence type needs the check or command name." and is not sent.
- A valid record saves, the state becomes **Verified**, and the reason becomes "Every required check has a current passing result."
- Recording a **failing** result immediately drops the state back to **Done** with "A required check failed (TEST_RESULT). Record a passing result, or re-verify after fixing the failure." — **without a page reload**, confirming the cache invalidation is correct.
- Recording a **newer passing** result re-verifies the task.
- Every evidence row displays the `MANUALLY SUPPLIED` tag; failed rows are badged `FAILED`.
- Deleting a record through the UI removes it and recomputes the state.
- Cross-owner probes through the API: `GET` list → `404`, `POST` to the owner's task → `404`, `DELETE` the owner's evidence → `404`. All evidence rows remained intact.
- Unauthenticated `GET` and `POST` → `401`.
- Credential-shaped payloads (Clerk live key, PEM private key, GitHub token) → `400` with an explicit error, and nothing was stored.
- **Responsive:** no horizontal overflow at 1440px, 1024px, 768px, or 390px, including with an evidence panel expanded at 390px. (A genuine overflow at 768px from the planner toolbar was found and fixed — the toolbar controls now wrap.)
- **Console:** zero errors across all five pages.

**Phase 8 — browser verification of the intelligence engine.** The real React app against the real API and database:

- The `/competitions/:id/intel` route loads with the five-step flow and zero console errors.
- **Problem analysis** extracted the real stored problem statement as a `VERIFIED FACT`, listed 11 requirements, and named the 4 fields the record does not contain (pain points, required outcomes, judging criteria, exclusions) with "Nothing has been assumed in their place."
- **Research** ran a live query and returned real findings from all three providers, each with a working "Open source" link, the provider, the source type, a `SOURCE-SUPPORTED` badge, and the retrieval time. The provider outcome row reported Wikipedia 5, arXiv 5, GitHub 1.
- **Manual research** was recorded and labelled `Recorded by you`.
- **Opportunities** produced one entry per finding and reported both evidence gaps and the next investigations.
- **Ideas** showed a clear "No AI provider is configured, so ideas cannot be generated for you" note rather than a generic error, and the scoring rubric stayed usable.
- With a provider present (pointed at a local stand-in for the chat-completions endpoint) the whole arc rendered: the idea, its total, and the full 19-section build brief.
- **Responsive:** no horizontal overflow at 1440px, 768px, or 390px across all five steps, with zero overflowing elements.
- **Console:** zero errors on every step.
- **Regression:** the existing Workflow page still renders 10 stages, and the competition detail page still links to intel, workflow, and planner.

Screenshots: `01-dashboard-with-competition.jpg`, `02-create-modal.jpg`, `03-validation-errors.jpg` (in the session evidence directory).

## Deployment readiness

### Target: Replit (evidence-based)

| Evidence | Detail |
| --- | --- |
| `.replit` | `modules = ["nodejs-24"]`, `[deployment] router = "application"`, `deploymentTarget = "autoscale"`, `[postMerge] path = "scripts/post-merge.sh"` |
| `artifacts/*/.replit-artifact/artifact.toml` | Three artifacts: `web` (static, `publicDir = artifacts/hackathon-os/dist/public`), `api` (Node service on port 8080), `design` (mockup sandbox, no production service) |
| GitHub repository description | "Repository for https://replit.com/@aiflowadib/HackathonOS" |
| Commit history | `62b6142 Published your App` is authored by `Replit Agent` with a `Replit-Commit-Deployment-Build-Id` header — the repo is a Replit-managed project mirrored to GitHub |
| `replit.md` | Documents the Replit run commands, the Auth pane for Clerk, and the post-merge script |

### Single deploy, two processes

The web app and the Express API deploy as **two services of one Replit deployment**, not two separate deployments. The `application` router splits traffic by path: the web artifact serves `/` as static files from `artifacts/hackathon-os/dist/public` with a `/*` → `/index.html` rewrite, and the API artifact serves `/api` on port 8080. The web app calls same-origin `/api` paths, so a single public hostname covers both. The API health check is `/api/healthz`.

### Required environment variable names

Values are never stored in the repo. See `.env.example` and the table in `replit.md`.

- `DATABASE_URL` — PostgreSQL connection string. **Required in production; the API now refuses to start without it.**
- `CLERK_SECRET_KEY` — **Required in production.**
- `CLERK_PUBLISHABLE_KEY` — **Required in production** (or `CLERK_SECRET_KEY`).
- `VITE_CLERK_PUBLISHABLE_KEY` — required by the web app at build time; the app throws `Missing VITE_CLERK_PUBLISHABLE_KEY in .env file` without it.
- `BASE_PATH` — web build; `/` in production.
- `PORT` — web build; `19678` in the artifact config.
- `VITE_CLERK_PROXY_URL` — optional; the web app defaults to `<origin>/api/__clerk` in production, and the API proxies that path to Clerk's frontend API. The Clerk proxy middleware only activates in production and only when `CLERK_SECRET_KEY` is set.
- `LOG_LEVEL` — optional; default `info`.

### Database migration requirement

**Phase 6 finding, since resolved.** At the end of Phase 6 there was no migration history, and the only mechanism was `drizzle-kit push` via `scripts/post-merge.sh`, which runs on Replit's post-merge hook. It works non-interactively (verified), but it diffs against the live database and can drop columns and data if the schema drifts. **Phase 7 introduced a generated migration folder (`drizzle-kit generate` + `drizzle-kit migrate`), and Phase 9 changed the post-merge hook to apply it.** The baseline procedure for a database that was originally created with `push` is documented under "Migration commands and procedures".

### GitHub push does not update Replit automatically

The repository is mirrored **from** Replit. Commits `5330373`, `52758f8`, and `1306a74` are the user's own local commits pushed to GitHub; there is no GitHub Actions workflow, no Replit GitHub-integration configuration in the repo, and no evidence of a GitHub → Replit sync. **Pushing to GitHub does not trigger a Replit build.** A Replit-side pull (or a Replit-side deploy action) is required.

### Current production state: STALE — **not changed in Phase 6**

`https://hackathonos.replit.app` is live and answers `200` on `/` and `200` on `/api/healthz`. However:

- `GET /api/competitions`, `GET /api/overview`, and `GET /api/__clerk/v1/environment` all return `404` with an Express "Cannot GET" body.
- The deployed `index.html` has `<title>Hackathon OS</title>`; the repository's `index.html` has `<title>HackathonOS</title>`.
- The deployed JavaScript bundle contains **none** of the app's strings — no `HackathonOS`, no `Clerk`, no `New workspace`, no `input-competition-name`.
- The deployed CSS contains none of the app's class names (`modal-card`, `eyebrow`, `competition-list`) and uses `Space Grotesk`, while the repository's web app uses `Manrope`.

The live deployment therefore serves a **placeholder build that predates the competition feature** — it is not the `1306a74` code and it does not contain the competition feature at all. The `x-powered-by: Express` header and a working `/api/healthz` confirm the API service is running an older build (one whose router only mounts `healthRouter`, matching the initial commit `0c05d76`, not `80df6be` which added the competitions router).

**Phase 6 did not deploy, did not change production configuration, and did not run any destructive database operation.** A read-only probe at the end of Phase 6 confirmed the deployed bundle hash is still `index-wB5QVmxO.js` — byte-identical to the Phase 5 observation, i.e. the live site is unchanged by this work.

### Verdict: NOT READY

Three independent blockers stand between this commit and a working production deployment:

1. **The Replit project is not running this code.** A Replit-side sync/deploy is required; the GitHub push did not propagate.
2. **`DATABASE_URL` and the Clerk keys must be configured as Replit secrets.** The API now fails fast without them, which is correct but means the deployment will not start until they are set.
3. **The production database has no migration history.** The reviewed migration system now exists (Phase 7) and the post-merge hook uses it (Phase 9), but the production database still has to be baselined once — see "Production baseline safety assessment".

The local blocker is **Clerk credentials**: no `pk_`/`sk_` key exists in this environment, so authenticated sign-in could not be exercised in the browser. Everything downstream of the session was verified by driving the real app and real API with the identity provider stubbed.

## Known issues and blockers

| Issue | Impact | Status |
| --- | --- | --- |
| Production deployment serves a stale placeholder build | The competition feature is not live | **Blocker** — needs a Replit-side sync and deploy; the stale build is confirmed, the exact cause is not |
| `scripts/post-merge.sh` still runs `drizzle-kit push` | The post-merge hook would apply schema changes destructively instead of through reviewed migrations | **FIXED in Phase 9** — the hook now runs `migrate:baseline` then `migrate`, with a regression test that fails if `push` returns |
| No migration history on the production database | `drizzle-kit migrate` would try to recreate existing tables and fail | **Blocker** — one `migrate:baseline` run after a verified backup; the read-only preflight is `migrate:baseline:check` |
| `DATABASE_URL` and the Clerk keys are not configured in the Replit deployment | The API will not start; every authenticated route is unusable | **Blocker** |
| Clerk credentials absent from this environment | Authenticated browser sign-in unverified | **Blocker for production**, not for the code |
| `OPENAI_API_KEY` is not configured | The generative steps of the intelligence engine stay disabled; everything else works | Open — the AI features are optional by design |
| `braces` 3.0.3 (CVE-2026-93687) | Stack exhaustion via nested brace patterns | **Explicit release risk.** No patched release exists. The exposure is pinned by tests and is not reachable in this configuration. |
| The post-merge hook has a 20 second timeout | A slow `pnpm install` on a cold container could abort the hook | Open — pre-existing; the added migration steps measured 0.3 s and 0.5 s on a warm cache |
| No rate limiting or security headers on the API | Abuse surface on the private API | Open — revisit before public exposure. The outbound research and AI calls are rate limited. |
| No CSP; third-party font and Clerk script origins | Wider XSS impact if a sink appears | Open |
| No lint script | Style regressions are not caught | Open |
| No CI workflow | Nothing runs automatically on push | Open — a GitHub push is not wired to a build |
| Web bundle is 559 kB (165 kB gzipped) | Slower first load | Open — the workflow route is code-split; the rest is not |
| `vite build` warns on `src/components/ui/tooltip.tsx` sourcemap resolution | Non-fatal build warning | Open |
| Orval regeneration adds an extra `export * from './generated/types'` to `lib/api-zod/src/index.ts` | Cosmetic drift after `codegen` | Open — decide whether to keep it |
| All evidence is manually supplied or retrieved from a public source | A passing `TEST_RESULT` is the owner's assertion, not machine proof | Accepted by design — the UI labels every record |
| No machine evidence collector | A task cannot be verified without a human recording evidence | Open — a CI or deployment collector is the natural next build |
| Evidence has no expiry policy | A very old passing result can still verify the task | Open — `observedAt` is stored, so a staleness window can be added |
| Research providers are unauthenticated public APIs | GitHub search allows 60 requests per hour per IP | Accepted — capped at 8 per minute, failures are reported |
| The AI rate limit is per process | It does not protect a multi-instance deployment | Open — a shared limiter is needed at scale |
| Scoring weights are a default, not a truth | The default rubric encodes one opinion about what matters | Open by design — the team can change the weights, and the UI shows them |

## Release decision

**READY FOR RELEASE PREPARATION**, with three deployment blockers that only the operator can clear.

The codebase is ready: the destructive release path is removed and guarded by
tests, the migration system is additive and reviewed, the baseline procedure
verifies the live schema rather than assuming it, the production configuration
fails closed, the AI provider is correctly isolated and credential-safe, and
213 tests pass.

What is **not** ready is the deployment itself, and the reason is not in the
code:

1. The Replit deployment is running a build that predates the competition
   feature. The stale build is confirmed; the exact cause is not.
2. The production database has no migration history and must be baselined
   once, after a verified backup.
3. The Replit secrets (`DATABASE_URL`, the Clerk keys) are not configured,
   so the API cannot start.

None of these can be cleared from this workspace, and none of them were
attempted. The full sequence is in "The exact safe deployment sequence".

## Remaining UI gaps

These are known and deliberate. None is presented as a working feature.

- **Research, Ideas, Build Workspace, Testing & Security, Deployment, Demo & Pitch, and Submission are stage views over saved plan tasks, not dedicated screens.** They are reachable from the Workflow page and from the planner, but each has no purpose-built interface yet (for example, a research-notes editor or a deployment checklist).
- **Retrospective and Settings & Integrations have no persisted source.** They appear in the sidebar and the Workflow page as *planned* and carry no counts, no progress, and no completion state.
- **Requirements cannot be marked satisfied.** The Overview lists the recorded mandatory deliverables with a "Not verified" state, but there is no record to attach a verification to, so nothing can honestly move off that state yet.
- **No stage-level evidence.** "Complete" means every task in the stage is `done`. "Verified" now means every task in it also has satisfying evidence. Neither means an independent build, test, security review, deployment, or submission was machine-verified — because nothing in this codebase runs checks on the user's behalf. The Workflow page states this explicitly under the stage list.
- **The quality ledger is still `not_run` for every check.** The Phase 6 and Phase 7 work did not connect the in-app ledger to real command output, so it deliberately stays empty rather than being populated with claims.
- **Evidence is entered by hand.** The panel is a record of what the owner observed, not a probe of the system. There is no automated collector, no CI integration, and no deployment check.
- **Evidence has no expiry.** A passing result recorded months ago still verifies the task, as long as the task's requirement has not changed.
- **The intelligence engine has one AI provider.** The provider interface supports others, but only the OpenAI-compatible client is implemented. A second provider was deliberately not added.
- **The research engine cannot read a paid or private source.** It queries three public APIs. A source that requires a subscription will not appear.
- **The gap analysis is conservative by design.** It reports one opportunity per retrieved source and says plainly that no source was compared against the requirements. It will not tell the team that a gap exists until a human has read the sources.
- **The rubric default is one opinion.** The weights can be changed per competition, and the UI shows the weight of every dimension, but a high total is still the team's own judgement and never a prediction.
- **The sidebar "LIFECYCLE" list is a static reference, not a live progress indicator.** It marks which stages a saved plan can back (`IN PLAN`) and which have no source (lock icon). It does not show per-stage progress, because the sidebar is shared across competitions and a single indicator would be ambiguous.
- **The sidebar "LIFECYCLE" list is a static reference, not a live progress indicator.** It marks which stages a saved plan can back (`IN PLAN`) and which have no source (lock icon). It does not show per-stage progress, because the sidebar is shared across competitions and a single indicator would be ambiguous.
- **The Overview has no competition switcher.** With more than one workspace, the Overview always leads with the one that has the earliest deadline, matching the API's `currentCompetition` rule. Choosing a different one requires the Competitions list.
- **No bulk actions.** Competition rows cannot be filtered, sorted, archived, or deleted from the list. There is no delete route in the API contract, so no delete control was added.
- **Reduced motion is honoured globally** via `prefers-reduced-motion`, and the entry animation is disabled, but individual transitions are not yet tuned per component.

## Files changed in this stage

| File | Why |
| --- | --- |
| **Phase 5** | |
| `artifacts/api-server/src/middlewares/auth.ts` | Removed the `TEST_AUTH_HEADER` escape hatch; the test identity bypass now requires `NODE_ENV === "test"`. Closes a production impersonation path. |
| `artifacts/api-server/src/app.ts` | Throw at startup in production when Clerk keys are missing, instead of silently serving `401` to every user. |
| `lib/db/src/index.ts` | Require `DATABASE_URL` in production; warn instead of silently falling back to localhost. |
| `lib/db/drizzle.config.ts` | Same production requirement for the Drizzle CLI, so `push`/`generate` cannot target localhost in production. |
| `artifacts/hackathon-os/src/lib/competition-form-validation.ts` | **New.** The form's validation logic extracted verbatim into a React-free module so it can be unit tested. No behaviour change. |
| `artifacts/hackathon-os/src/components/CompetitionModal.tsx` | Imports the extracted validation module and re-exports the same names, so existing importers are unaffected. |
| `artifacts/hackathon-os/test/competition-form-validation.test.mjs` | **New.** 12 unit tests covering required fields, name length, deadline, URL scheme, team size bounds, and problem-statement length. |
| `artifacts/hackathon-os/package.json` | Added a `test` script so the web package's tests run under `pnpm test`. |
| `artifacts/hackathon-os/vite.config.ts` | Added a dev-only `/api` proxy to `http://127.0.0.1:8080` (overridable via `API_PROXY_ORIGIN`) so the documented local dev flow can reach the API outside Replit. |
| `pnpm-workspace.yaml` | Added `vite: 7.3.7` (fixes three vite advisories) and `markdown-it: 14.3.3` (fixes three markdown-it advisories) as overrides. |
| `pnpm-lock.yaml` | Regenerated by `pnpm install` for the two overrides. |
| `.env.example` | Documented every required environment variable **name** with no values. |
| `replit.md` | Added the environment variable table, the `pnpm test` command, the dev-proxy gotcha, and the `PORT`/`BASE_PATH` build requirement. |
| **Phase 6** | |
| `artifacts/hackathon-os/src/lib/workflow.ts` | **New.** The lifecycle stage model: the 9 stage definitions mapped to the planner's 14 persisted phases, the state machine (`complete` / `active` / `blocked` / `scheduled` / `not_started` / `planned`), plan-progress aggregation, duration formatting, and deadline countdown. Pure, React-free, and unit tested. |
| `artifacts/hackathon-os/test/workflow.test.mjs` | **New.** 24 unit tests, including a guard that every planner phase is owned by exactly one stage and that a task in any phase is visible in some stage (this caught the `intake`/`problem` gap where two tasks were invisible). |
| `artifacts/hackathon-os/src/pages/workflow.tsx` | **New page.** `/competitions/:id/workflow`. Shows time remaining, plan progress, effort remaining, and blocked-stage count, then groups every stage by its real state with the next task, its phase, its dependencies, and any blockers. |
| `artifacts/hackathon-os/src/components/Dialog.tsx` | **New.** Accessible modal: `aria-modal`, `aria-labelledby`/`aria-describedby`, focus moved in on open, focus trapped, Escape to close, focus restored to the trigger, and background scroll locked. |
| `artifacts/hackathon-os/src/components/CompetitionModal.tsx` | Rebuilt on `Dialog`; added a re-entrancy guard so a second submit cannot fire while one is in flight, focus moves to the first invalid field on failed validation, and error text is linked to its control with `aria-describedby`/`aria-invalid`. |
| `artifacts/hackathon-os/src/components/workspace.tsx` | Sidebar rebuilt around the real IA (Overview / Competitions / Workflow + a LIFECYCLE group derived from the stage model); real breadcrumbs replacing the hard-coded label; `aria-current` on active links; mobile drawer closes on Escape and on route change; `FormField` gained an `errorId`; removed the dead `plannedModules` list and the unused `dashboardIcons` export. |
| `artifacts/hackathon-os/src/pages/overview.tsx` | Rebuilt to answer the product questions from real data: time remaining, blocked count, required deliverables, the active stage, and the next action's acceptance criteria. Added a link into the workflow view. |
| `artifacts/hackathon-os/src/pages/competitions.tsx` | Added the track to each row, a relative-time deadline indicator that flags urgent and overdue entries, and corrected copy about planned modules. |
| `artifacts/hackathon-os/src/pages/competition-detail.tsx` | Added time remaining and a missing-source warning to the context panel, and a second route into the workflow view. |
| `artifacts/hackathon-os/src/pages/planner.tsx` | Uses the shared `phaseLabel` helper instead of a local copy, and links to the lifecycle view. |
| `artifacts/hackathon-os/src/pages/not-found.tsx` | Replaced the light-mode template (which broke the dark design system) with a themed 404 that offers real routes. |
| `artifacts/hackathon-os/src/App.tsx` | Registered the workflow route and code-split it with `React.lazy` (9.26 kB separate chunk). |
| `artifacts/hackathon-os/src/index.css` | Added the Phase 6 component styles, a visible focus ring for keyboard users, a `prefers-reduced-motion` block, and responsive rules for the new components. Raised 8 text colours to meet WCAG AA. |
| **Phase 7** | |
| `lib/db/src/schema/evidence.ts` | **New.** The `workflow_evidence` table. Additive only: a new table with two indexes, a cascading FK to `competitions`, and a `SET NULL` FK to `workflow_tasks` so evidence survives plan recalculation. |
| `lib/db/src/schema/index.ts` | Exports the new schema module. |
| `lib/db/drizzle.config.ts` | Added `out: "drizzle"` and an explicit migration table/schema so `drizzle-kit migrate` has a defined target. |
| `lib/db/drizzle/0000_baseline_existing_schema.sql` | **New.** The reviewed baseline migration. Purely additive, and verified to match the live schema exactly. |
| `lib/db/drizzle/0001_add_workflow_evidence.sql` | **New.** The reviewed evidence migration. Purely additive. |
| `lib/db/drizzle/meta/_journal.json` | **New.** Generated migration journal. |
| `lib/db/scripts/mark-baseline-applied.mjs` | **New.** Records the baseline as applied on a database that was created with `drizzle-kit push`, without executing its SQL. Idempotent, and it refuses to run when the baseline tables are absent. Never prints the connection string. |
| `lib/db/scripts/test-migrations.sh` | **New.** Applies the migrations to a throwaway database with seeded records and asserts nothing is lost. |
| `lib/db/package.json` | Added `generate`, `migrate`, `migrate:status`, `migrate:baseline`, and `test:migrations` scripts. |
| `artifacts/api-server/src/lib/verification.ts` | **New.** The verification rules as pure, unit-tested functions: the five states, the phase→required-evidence mapping, staleness and supersession, and the plan-progress aggregation. |
| `artifacts/api-server/test/verification.test.mjs` | **New.** 24 unit tests covering every transition rule, including that DONE is not VERIFIED, that a deployment URL alone does not verify, and that changing a requirement invalidates prior evidence. |
| `artifacts/api-server/src/routes/evidence.ts` | **New.** The evidence routes, with owner scoping on every read and write, credential-shaped content rejection, and a future-timestamp guard. |
| `artifacts/api-server/test/evidence-api.test.mjs` | **New.** 17 integration tests over the real API and database: valid and invalid evidence, task linkage, missing evidence, failed evidence, manual labelling, unauthorized access, cross-owner access, verification transitions, and persistence. |
| `artifacts/api-server/src/routes/competitions.ts` | Task serialization now carries the derived `verification` object, recomputed from evidence on every read, so a status change can never leave a stale verified flag. |
| `artifacts/api-server/src/routes/index.ts` | Mounts the evidence router behind the same auth guard. |
| `artifacts/api-server/src/app.ts` | Re-exports `workflowEvidenceTable` for the test harness. |
| `artifacts/api-server/src/lib/planner.ts` | `serializeTask` now requires the verification state instead of defaulting it, so a task can never be serialised without one. |
| `lib/api-spec/openapi.yaml` | Added the three evidence endpoints, the `Evidence`/`EvidenceInput`/`EvidenceDeletion`/`TaskVerification` schemas, and the `verification` field on `PlanTask`. |
| `artifacts/hackathon-os/src/lib/evidence-model.ts` | **New.** Client-side evidence labels, rules, and state explanations. Display only — the server remains the authority on whether a task is verified. |
| `artifacts/hackathon-os/src/components/EvidencePanel.tsx` | **New.** The accessible evidence panel: existing evidence with source and timestamp, failed and stale badges, why verification is blocked, an add-evidence form with per-type field requirements, and delete for re-verification. |
| `artifacts/hackathon-os/src/pages/planner.tsx` | Task cards now show the evidence panel, and the plan/overview caches are invalidated when evidence changes. |
| `artifacts/hackathon-os/src/lib/workflow.ts` | Added the `verified` stage state and per-stage verified counts. |
| `artifacts/hackathon-os/src/pages/workflow.tsx` | Groups verified stages separately and shows a per-stage verified count. |
| `artifacts/hackathon-os/src/index.css` | Evidence panel styles, plus a fix for the 768px horizontal overflow the planner toolbar introduced. |
| `artifacts/hackathon-os/test/workflow.test.mjs` | Added 4 tests for the `verified` stage state. |
| **Phase 8** | |
| `artifacts/api-server/src/lib/intel/claims.ts` | **New.** The claim kinds, requirement categories, research source types, and the normalisers that downgrade anything unrecognised to an inference. |
| `artifacts/api-server/src/lib/intel/ai-types.ts` | **New.** The provider-independent `AiProvider` interface, the `AiError` type, and the shared configuration error. |
| `artifacts/api-server/src/lib/intel/openai-provider.ts` | **New.** The single AI provider integration: server-side key handling, timeouts, JSON-mode parsing with recovery, and credential redaction in upstream errors. |
| `artifacts/api-server/src/lib/intel/research.ts` | **New.** The three live keyless research providers and the parallel search runner. |
| `artifacts/api-server/src/lib/intel/problem-analysis.ts` | **New.** The deterministic requirement extraction from the stored record, the merge that refuses to let a model promote its own output, and the analysis prompt. |
| `artifacts/api-server/src/lib/intel/ideas.ts` | **New.** The rubric, weight normalisation, weighted totals, sensitivity analysis, model-output parsing, and idea de-duplication. |
| `artifacts/api-server/src/lib/intel/gaps.ts` | **New.** The conservative gap analysis, the merge that forces unsupported gaps to hypotheses, and the build brief parsing. |
| `artifacts/api-server/src/lib/intel/helpers.ts` | **New.** The shared ownership lookup, the provider factory, and the error-to-response mapping. |
| `artifacts/api-server/src/routes/intel.ts` | **New.** The fifteen intel endpoints, all scoped to an owned competition. |
| `artifacts/api-server/src/routes/index.ts` | Mounts the intel router behind the same auth guard. |
| `artifacts/api-server/src/app.ts` | Re-exports the new tables for the test harness. |
| `artifacts/api-server/tsconfig.json` | Enables `allowImportingTsExtensions` so the intel modules can be unit tested directly from source. |
| `artifacts/api-server/test/intel.test.mjs` | **New.** 43 unit tests over the deterministic engines and the rules that stop the engine overclaiming. |
| `artifacts/api-server/test/intel-api.test.mjs` | **New.** 29 integration tests over the real API and database, including authentication, cross-owner isolation, and competition scoping. |
| `artifacts/api-server/test/intel-provider.test.mjs` | **New.** 11 tests over the provider: key handling, timeouts, rate limiting, malformed output, and credential redaction. |
| `lib/db/src/schema/intel.ts` | **New.** The eight intel tables, all additive and all scoped to a competition. |
| `lib/db/src/schema/index.ts` | Exports the new schema module. |
| `lib/db/drizzle/0002_add_intel_engine_tables.sql` | **New.** The reviewed, purely additive intel migration. |
| `lib/db/scripts/test-migrations.sh` | Extended to assert the intel tables, their scoping, and their cascades. |
| `lib/api-spec/openapi.yaml` | Added the intel endpoints and schemas, and made `ErrorResponse` carry a machine-readable `code`. |
| `artifacts/hackathon-os/src/lib/intel-model.ts` | **New.** Client-side labels for claim kinds, categories, dimensions, and brief sections. Display only — the server decides what is true. |
| `artifacts/hackathon-os/src/pages/intel.tsx` | **New page.** The five-step intelligence interface. |
| `artifacts/hackathon-os/src/App.tsx` | Registered the intel route. |
| `artifacts/hackathon-os/src/index.css` | The intel interface styles, in the existing dark developer-tool system. |
| `artifacts/hackathon-os/src/pages/competition-detail.tsx` | Added the intel route to the "next" panel. |
| `PROJECT_STATUS.md` | This document. |
| **Phase 9** | |
| `scripts/post-merge.sh` | **Replaced `drizzle-kit push` with the reviewed migration system** (`migrate:baseline` then `migrate`). The install step, fail-fast behaviour, and executable bit are preserved, and the script now pins its own working directory. This is the removal of the single destructive path in the release pipeline. |
| `lib/db/scripts/schema-comparison.ts` | **New.** Parses a Drizzle migration into the structure it creates and compares it against a live schema. Superset semantics: the baseline counts as applied when everything it creates is already present; extra live objects are reported as drift. |
| `lib/db/scripts/mark-baseline-applied.mjs` | **Rewritten.** Now verifies the live schema structurally before recording the baseline, refuses on divergence, reports an empty database as "nothing to record", adds a read-only `--check` mode, and still writes exactly one ledger row and never touches an application table. |
| `lib/db/test/migration-scripts.test.mjs` | **New.** 8 regression tests: the hook must not run `drizzle-kit push`, must run the migration commands, must keep its other behaviour, must be executable, and **no deployment path anywhere in the repository may run `drizzle-kit push`**. |
| `lib/db/test/schema-comparison.test.mjs` | **New.** 9 unit tests for the schema comparison, including the drift cases and the guarantee that a destructive statement elsewhere in the file cannot affect the baseline parse. |
| `lib/db/package.json` | Added a `test` script so the new tests run under the root `pnpm test`, plus `migrate:baseline:check`. The `push` scripts are kept, local-development only. |
| `artifacts/api-server/src/lib/intel/rate-limit.ts` | **New.** The fixed-window limiter, extracted from the route module so its behaviour is unit tested rather than implicit. |
| `artifacts/api-server/src/routes/intel.ts` | Uses the extracted limiter. The limits are unchanged (8 research and 12 AI calls per minute). |
| `artifacts/api-server/test/rate-limit.test.mjs` | **New.** 5 unit tests, including the exact documented limits. |
| `artifacts/api-server/test/dependency-braces.test.mjs` | **New.** 5 regression tests pinning the `braces` mitigation: the proxy path is not a glob, no `pathFilter` is configured, and a path with 4000 nested braces leaves the server serving. |
| `lib/api-spec/package.json` | The codegen pipeline now runs prettier over the generated output, so the committed files stay formatted and `git diff --check` stays clean. Codegen was verified to be deterministic. |
| `replit.md` | Updated: the migration commands, the push/migrate difference, the baseline procedure, and the new post-merge behaviour. |
| `PROJECT_STATUS.md` | This document. |

Not changed in either phase: no database schema, no saved project data, no API route contract, no API request or response shape, and no production configuration. The Orval-generated `lib/api-zod/src/index.ts` drift was reverted rather than committed. No commit and no push was performed.

## Recommended next phase

1. **Configure `OPENAI_API_KEY` for the deployment and exercise the AI path against the live provider.** The client, the prompts, the structured output validation, and the error handling are all built and were proven against a local stand-in. A real credential is the only missing piece, and it is the difference between the engine being a scaffold and being usable.
2. **Add a machine evidence collector.** The evidence model already stores `source`, and the API already refuses client-supplied provenance. A server-side collector that runs a project command, captures the exit status, and writes a `TEST_RESULT` with `source: "machine"` is what turns a manual attestation into proof.
3. **Make the gap analysis compare sources against the requirements.** The conservative pass reports one opportunity per source. Once a source has been read and marked, the engine can compare it against the recorded requirements and say which requirement it fails to meet — which is where a genuine, defensible gap comes from.

## Exact next steps

1. **Configure the Replit deployment secrets** — `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, and `OPENAI_API_KEY` — and confirm the Auth pane instance matches. The API will not start without the first three, and the AI features stay disabled without the last.
2. **Change `scripts/post-merge.sh` to use `migrate`**, and have it run `migrate:baseline` only when the baseline has not been recorded.
3. **Back up the production database, then run `migrate:baseline` and `migrate` against it** as a rehearsal, before the Replit deploy.
4. **Deploy from the Replit side.** Pushing to GitHub does not rebuild Replit. Pull the current work into the Replit project and run a deployment, then verify `GET /api/competitions` returns `401` (not `404`) — that `404` is the signature of the stale build.
5. **Verify the production deployment with a real Clerk session**: sign in, run a research search, generate a plan, record evidence, and confirm the task reports *Verified*.
6. **Add CI** running `pnpm install --frozen-lockfile && pnpm run typecheck && pnpm test && pnpm --filter @workspace/db run test:migrations && PORT=19678 BASE_PATH=/ pnpm run build` on every push, so a regression cannot reach the deployment again.
7. **Add a minimal lint** (prettier is already a dev dependency) once the intended formatting baseline is decided.
8. **Re-check `braces` when `braces` 3.0.4 is published** and add the override then; the current exposure is not reachable in this app.
9. **Add rate limiting and security headers** to the API before the app is exposed beyond a single-user private workspace.
