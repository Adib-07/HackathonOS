# HackathonOS

HackathonOS is a private, personal command center for organizing hackathons, building deadline-aware plans, and keeping verification evidence honest.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server on its configured port
- `pnpm --filter @workspace/hackathon-os run dev` — run the web app on its configured port
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required runtime env: `DATABASE_URL`; Clerk is managed through the workspace Auth setup

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
- `pnpm --filter @workspace/db run push` applies development database schema changes; do not use it as a production migration.
- The Clerk proxy is production-only. Leave `VITE_CLERK_PROXY_URL` unset in the local preview so Clerk uses its development flow.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
