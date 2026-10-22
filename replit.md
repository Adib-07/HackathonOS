# HackathonOS

HackathonOS is a private, personal command center for organizing hackathons, building deadline-aware plans, and keeping verification evidence honest.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server on its configured port
- `pnpm --filter @workspace/hackathon-os run dev` — run the web app on its configured port
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm test` — run every package's test suite
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run generate` — generate a migration from the schema diff
- `pnpm --filter @workspace/db run migrate` — apply pending migrations in order
- `pnpm --filter @workspace/db run migrate:baseline` — record the baseline as applied (once, on a database created with `drizzle-kit push`)
- `pnpm --filter @workspace/db run test:migrations` — apply the migrations to a throwaway database and assert records survive
- Required runtime env: `DATABASE_URL`; Clerk is managed through the workspace Auth setup

## Environment variables

Names only; never commit values. See `.env.example` for the full list.

| Name | Required | Used by | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | API, Drizzle | PostgreSQL connection string. The API refuses to start in production without it. |
| `CLERK_SECRET_KEY` | yes | API | Backend secret key. Required in production. |
| `CLERK_PUBLISHABLE_KEY` | yes | API | Backend publishable key, resolved per host. Required in production. |
| `VITE_CLERK_PUBLISHABLE_KEY` | yes | Web | Frontend publishable key, read at build time. |
| `VITE_CLERK_PROXY_URL` | no | Web | Set to `<origin>/api/__clerk` to proxy Clerk through the API. Leave unset in local development. |
| `BASE_PATH` | yes | Web build | Base path the web app is served from (`/` in production). |
| `PORT` | yes | Web build | Port for the web dev/preview server (`19678`). |
| `LOG_LEVEL` | no | API | Log level, default `info`. |
| `OPENAI_API_KEY` | no | API | Enables the generative steps of the intelligence engine. The key is read on the server only. |
| `OPENAI_BASE_URL` | no | API | Optional override for an OpenAI-compatible gateway or self-hosted deployment. |
| `OPENAI_MODEL` | no | API | Optional. Defaults to `gpt-4o-mini`. |

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Web: React, Vite, Wouter, TanStack Query
- API: Express 5, Clerk session authentication
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- API build: esbuild

## Where things live

- `artifacts/hackathon-os/src/` — public landing page, private workspace, competition forms, overview, and planner
- `artifacts/api-server/src/routes/competitions.ts` — owner-scoped competition, plan, and task endpoints
- `artifacts/api-server/src/lib/planner.ts` — deadline-aware plan generation
- `artifacts/api-server/src/middlewares/auth.ts` — Clerk session to authenticated user boundary
- `lib/api-spec/openapi.yaml` — source API contract
- `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` — generated client hooks and validators
- `lib/db/src/schema/` — PostgreSQL tables and Drizzle schema

## Architecture decisions

- The server derives the owner from the Clerk session; never accept an owner ID from the browser.
- Earlier plan versions remain reviewable and read-only; task status changes apply only to the latest version.
- Quality checks stay `not_run` until a real result is recorded. Task completion is not evidence that a build, test, review, or submission passed.
- The planner reserves time for testing, the demo, submission, and an explicit schedule buffer; warnings make missing rules or deliverables visible.

## Product

- Users can create and update competition workspaces with deadlines, source links, requirements, tracks, and team context.
- Each workspace can keep versioned plans and task progress in PostgreSQL, available across refreshes.
- Research automation, agent control, app verification, deployment, pitch support, and external integrations are planned but not yet available; do not present them as working features.

## Gotchas

- Regenerate API code after editing `lib/api-spec/openapi.yaml`.
- **Schema changes go through reviewed migrations, not `drizzle-kit push`.** `push` is authoritative over the schema: it diffs the live database against the TypeScript schema and applies the difference, so it can **drop columns and tables** that are not in the schema. Use `pnpm --filter @workspace/db run generate`, review the generated SQL in `lib/db/drizzle/`, then `pnpm --filter @workspace/db run migrate`.
- `drizzle-kit push` remains available as a **local development convenience only** (`pnpm --filter @workspace/db run push`). It must not be run against a deployed database.
- **Back up the database before migrating.** `pg_dump --format=custom --file=backup.dump "$DATABASE_URL"`. There are no down migrations, so recovery is by restore.
- A database that was created with `drizzle-kit push` has no migration history. Run `pnpm --filter @workspace/db run migrate:baseline` once. It compares the live schema, structurally, against the baseline migration and only records the baseline when the live database already contains it. Run `pnpm --filter @workspace/db run migrate:baseline:check` first for a read-only preflight.
- `scripts/post-merge.sh` is the Replit post-merge hook. It now runs `migrate:baseline` and then `migrate`. It no longer runs `drizzle-kit push`.
- The Clerk proxy is production-only. Leave `VITE_CLERK_PROXY_URL` unset in the local preview so Clerk uses its development flow.
- `vite dev` proxies `/api` to `http://127.0.0.1:8080` so the web app can reach the API locally. Override with `API_PROXY_ORIGIN`. In the Replit deployment the application router performs that split instead, and no proxy is involved.
- `PORT` and `BASE_PATH` are required by both Vite configs, so `pnpm run build` needs them: `PORT=19678 BASE_PATH=/ pnpm run build`.
- The API derives the owner from the Clerk session. The `x-test-user-id` header is honoured only when `NODE_ENV=test`; it is ignored in every other environment.
- **Verification evidence is always manually supplied or retrieved from a public source.** Nothing in this codebase runs a user's commands for them, so the API refuses client-supplied machine provenance and every record is labelled with how it was obtained.
- **The intelligence engine works without `OPENAI_API_KEY`.** The problem analysis, research search, gap analysis, scoring rubric, and build brief all run from stored data. Only the generative steps need a provider, and they fail with a clear configuration error when it is missing.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
