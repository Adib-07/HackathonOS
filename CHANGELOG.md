# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Retrospective lifecycle stage with 4 real phases (`retrospective_what_worked`, `retrospective_what_failed`, `retrospective_lessons_learned`, `retrospective_next_steps`)
- Settings & Integrations page (`/settings`) with workspace identity, competition defaults, connected tools, and danger zone
- Correct unlock tooltip for Retrospective: "Unlocks when Submission is complete or the deadline has passed"
- Settings link in primary sidebar navigation
- Component tests for sidebar, workflow page, and settings page (27 Vitest tests)

### Changed
- Removed Settings from lifecycle stages (now separate page)
- Updated workflow library to accept competition deadline for retrospective unlock logic
- Updated Playwright smoke tests for new lifecycle behavior

---

## [0.1.0] - 2026-10-26

### Fixed - Locked Lifecycle Stages (Commit aa46354)
- **Retrospective**: Added 4 real plan phases with unlock rule (Submission complete OR deadline passed)
- **Settings & Integrations**: Moved to dedicated `/settings` page with workspace name, competition defaults, connected tools, danger zone
- **Tooltips**: Fixed misleading "Unlocks when a plan includes [stage] tasks" → correct unlock rules
- **Tests**: Updated 40 workflow tests + 27 component tests for new behavior

### Added - Test Infrastructure (Commit 937f252)
- RTL-style component tests for WorkspaceShell, WorkflowPage, SettingsPage
- Playwright authenticated smoke tests for lock tooltips and navigation
- Pure function tests for lifecycle stage logic (retrospective unlock, phase mapping)

### Fixed - UI Polish (Commit 1e4c969)
- Lock tooltips on sidebar and workflow page
- Workspace switcher chevron removed (single-user workspace)

### Fixed - Build Optimization (Commit 46ecc7c)
- API server bundle size reduced via conditional Vercel build
- esbuild config excludes dev dependencies from production bundle

### Fixed - Build Log Hygiene (Commit d1c64c6)
- Clean Vercel build output (removed noisy warnings)
- TypeScript strict mode passes

### Fixed - Neon Database & Deployment (Commit 8a769ba)
- Neon PostgreSQL setup documented
- Migration scripts (`pnpm run migrate`) working in CI/local
- Database connection pooling for serverless

### Fixed - Bug Sweep Phase B (Commit d72427d)
- CompetitionModal race condition resolved
- EvidencePanel unhandled promise rejections fixed
- Intel page promise handling corrected

### Fixed - Race Conditions (Commit fec9b1d)
- CompetitionModal state updates synchronized
- EvidencePanel async operations properly awaited
- Intel page API calls sequenced correctly

### Added - Smoke Test Documentation (Commit 18c7350)
- Phase A smoke test results documented
- Live verification steps recorded

### Added - Playwright Smoke Tests (Commit 49d8b60)
- Authenticated navigation tests
- CSP violation detection
- Console error monitoring
- Failed request tracking

### Fixed - Vercel FUNCTION_INVOCATION_FAILED (Commit 95e5be0)
- Lazy environment validation (not at module load)
- Lazy database pool initialization
- Production Pino logger configuration
- Smoke test script for CI verification

### Fixed - CSP Configuration (Commit 7641934)
- Corrected CSP to allow Clerk, Cloudflare, Google Fonts
- Styles, fonts, and Clerk assets now load correctly
- Security headers maintained

### Fixed - Phase 1 Deployment Fixes (Commit be9e655)
- Blank page on Vercel resolved
- Function errors eliminated
- Static asset serving corrected

### Fixed - Vercel Function Import (Commit b7343d4)
- `.mjs` entry point pointing to bundled Express app
- `api/bundle.mjs` copied at build time
- ES modules compatibility ensured

### Fixed - Vercel Ignore Rules & Build Command (Commit 9ff6f67)
- `.vercelignore` patterns corrected
- Build command: `pnpm run build` (monorepo-aware)
- Output directory: `artifacts/hackathon-os/dist/public`

### Fixed - Node.js Version (Commit b1fc25b)
- Upgraded to Node 24.x (from deprecated 20.x)
- `engines.node: "24.x"` in root `package.json`
- Vercel runtime compatibility ensured

### Added - Vercel Serverless Entry (Commit aad0f7d)
- `api/index.mjs` imports bundled `api/bundle.mjs`
- `vercel.json` with functions, rewrites, headers
- Express app exported via `exports["/app"]`

### Cleaned - Replit Leftovers (Commit 03bb579)
- Removed Replit-specific configs
- Updated `.gitignore`, `.npmignore`, `.vercelignore`
- Deployment docs updated

### Fixed - Vercel Config (Commit 8f16caf)
- Removed invalid `functionRuntime` field
- Minimal valid config for frontend-only deploy
- Serverless function config separated

### Added - Security Hardening (Commit 03cf170)
- Helmet middleware on all API routes
- CSP with nonce-ready structure
- Rate limiting per IP + in-process AI/research limiters
- Secret scanning in evidence submission
- CI checks for security headers

### Added - Intelligence & Evidence Workflows (Commit 5e55c3a)
- Problem analysis (deterministic + AI)
- Research search (multi-provider: DuckDuckGo, Exa, Brave, Serper)
- Gap analysis (deterministic + AI)
- Idea generation (AI with structured output)
- Idea evaluation (10-dimension rubric)
- Build brief generation (from selected idea)
- Evidence ledger with verification states

### Added - Competition Workspace (Commit 1306a74)
- Competition CRUD (create, read, update, delete)
- Deadline-aware planner with versioned plans
- Task board with status transitions
- Workflow lifecycle stages (9 stages + retrospective)

---

## [0.0.1] - 2026-10-01

### Added - Initial Commit (Commit 0c05d76)
- Project structure: pnpm monorepo with artifacts, lib, scripts
- Frontend: React 19 + Vite + Tailwind + TanStack Query
- Backend: Express 5 + Drizzle ORM + Clerk
- Database: Neon PostgreSQL schema (competitions, plans, tasks, evidence)
- Auth: Clerk integration (React + Express)
- API client generation via Orval
- Deployment: Vercel configuration

---

## Version History Summary

| Version | Date | Key Changes |
|---------|------|-------------|
| Unreleased | — | Retrospective phases, Settings page, test coverage |
| 0.1.0 | 2026-10-26 | Full lifecycle, intelligence engine, evidence, deployment fixes |
| 0.0.1 | 2026-10-01 | Project initialization, monorepo setup |

---

## Commit Categories

For future releases, categorize commits as:

| Prefix | Meaning |
|--------|---------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `refactor:` | Code restructuring |
| `perf:` | Performance improvement |
| `test:` | Test additions/changes |
| `chore:` | Build, deps, config |
| `build:` | Build system changes |
| `ci:` | CI/CD changes |
| `security:` | Security hardening |

---

## Release Process

1. Update version in root `package.json`
2. Update `CHANGELOG.md` with release date
3. Tag commit: `git tag v0.x.x`
4. Push tag: `git push origin v0.x.x`
5. Vercel auto-deploys from `main`
6. Verify health endpoints
7. Create GitHub Release with changelog excerpt