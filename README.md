# HackathonOS

> A private, deadline-aware command center for hackathon teams. Plan, track, and ship with evidence-backed confidence.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node: 24.x](https://img.shields.io/badge/Node-24.x-green.svg)](https://nodejs.org/)
[![pnpm: 11.x](https://img.shields.io/badge/pnpm-11.x-orange.svg)](https://pnpm.io/)
[![TypeScript: 5.9](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Deploy: Vercel](https://img.shields.io/badge/Deploy-Vercel-black.svg)](https://vercel.com/)
[![Live Demo](https://img.shields.io/badge/Live-Demo-49c998.svg)](https://hackathonos-mu.vercel.app)

---

## Table of Contents

- [Overview](#overview)
- [Screenshots](#screenshots)
- [Features](#features)
- [Workflow & Lifecycle](#workflow--lifecycle)
- [Architecture](#architecture)
- [Data Model](#data-model)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [Testing](#testing)
- [Security](#security)
- [Performance](#performance)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

### The Problem

Hackathons are time-boxed, high-pressure events where teams must:

- Read and understand competition rules under tight deadlines
- Choose a track, validate an idea, and scope an MVP
- Build, test, secure, and deploy a working product
- Prepare a demo, pitch, and submission package
- Reflect on what worked and what didn't

Existing tools (Notion, Linear, GitHub Projects) treat these as generic tasks. They don't understand hackathon-specific constraints: hard deadlines, mandatory deliverables, judging criteria, and the need for evidence that a build actually works.

### What HackathonOS Does

HackathonOS is a **private, single-user workspace** that models the hackathon lifecycle as first-class concepts:

| Phase | What It Covers |
|-------|----------------|
| **Intake & Scope** | Confirm rules, lock smallest credible scope |
| **Research** | Gather source-backed findings, separate facts from assumptions |
| **Ideas** | Choose a track, challenge one idea before committing build time |
| **Build Workspace** | Write specification, build smallest complete product |
| **Testing & Security** | Run real checks, review access to private project data |
| **Deployment** | Publish app, verify real production URL |
| **Demo & Pitch** | Rehearse demonstration, prepare pitch narrative |
| **Submission** | Audit every required item against official instructions |
| **Retrospective** | Capture what worked, what failed, lessons learned, next steps — unlocks when Submission is complete or deadline passes |
| **Settings & Integrations** | Workspace name, competition defaults, connected tools, danger zone |

### Why HackathonOS

- **Deadline-aware planning**: The planner generates a time-boxed task sequence from the competition deadline and available hours
- **Evidence-backed verification**: Tasks are only "Verified" when real evidence (test runs, screenshots, manual checks) satisfies their verification method
- **Intelligence engine**: AI-assisted problem analysis, research search, gap detection, idea generation, and build briefs — all grounded in your recorded data
- **Privacy by design**: Single-user workspace, no team invites, no data sharing. Your competition data stays yours.
- **Type-safe end-to-end**: Drizzle ORM → Zod schemas → TanStack Query hooks → React components

---

## Screenshots

> **Note**: Screenshots are placeholders. Capture them using the steps below and place in `docs/images/`.

| View | Placeholder | How to Capture |
|------|-------------|----------------|
| Overview Dashboard | `docs/images/overview.png` | Sign in → land on `/` |
| Competitions List | `docs/images/competitions.png` | Click "Competitions" in sidebar |
| Workflow / Lifecycle | `docs/images/workflow.png` | Open a competition → click "Workflow" |
| Planner / Task Board | `docs/images/planner.png` | Open a competition → click "Planner" |
| Intelligence (Research/Ideas) | `docs/images/intel.png` | Open a competition → click "Intel" |
| Settings & Integrations | `docs/images/settings.png` | Click "Settings" in sidebar |

**Capture steps** (macOS):
```bash
# Start dev server
pnpm --filter @workspace/hackathon-os run dev

# Open http://localhost:PORT, sign in with Clerk test user
# Use Cmd+Shift+4 to capture each view, save to docs/images/
```

---

## Features

### Workspaces & Competitions
- **Single-user workspace**: Private by design, no team management overhead
- **Competition CRUD**: Name, organizer, type, dates, team size, track mode, problem statement, URLs, mandatory deliverables, team skills, idea complexity
- **Status tracking**: `preparing` → `active` → `completed` (manual)

### Lifecycle Stages (10 stages)
Each stage derives its state from persisted plan tasks:
- **States**: `not_started` → `scheduled` → `active` → `complete` → `verified` (or `blocked` at any point)
- **Retrospective** unlocks when **Submission complete** OR **deadline passed**
- **Settings** is a separate page, not a lifecycle stage

### Workflow Planner
- **Deadline-aware generation**: Calculates available minutes from deadline, applies 20% buffer
- **Three plan tiers**: Short (<30 min), Medium (30–180 min), Full (>180 min)
- **Versioned plans**: Each regeneration increments version; history preserved
- **Task status transitions**: `todo` ↔ `in_progress` ↔ `blocked` ↔ `done` ↔ `deferred`
- **Evidence integration**: Attach evidence to any task; verification recomputed on read

### Task & Evidence Ledger
- **Task fields**: key, title, description, phase, priority, estimates, dependencies, acceptance criteria, expected artifact, verification method, risk if skipped, mandatory flag
- **Evidence types**: `test_run`, `build_output`, `manual_check`, `security_review`, `deployment_check`, `demo_rehearsal`, `submission_audit`
- **Verification states**: `DONE` (owner marked done) vs `VERIFIED` (evidence satisfies method)
- **Quality signals**: Application build, automated tests, browser verification, security review, deployment, demo readiness, submission readiness (all `not_run` until wired)

### Intelligence Engine (AI-Assisted, Deterministic Fallback)
- **Problem Analysis**: Extract requirements from competition record; AI adds missing fields and unanswered questions
- **Research**: Search DuckDuckGo, Exa, Brave, Serper; store findings with source URLs, claim kinds (`SOURCE_SUPPORTED`, `INFERENCE`, `HYPOTHESIS`)
- **Gap Analysis**: Deterministic gaps from findings + requirements; AI proposes additional opportunities
- **Idea Generation**: AI proposes distinct MVP-scoped ideas with differentiators, risks, unverified assumptions
- **Idea Evaluation**: 10-dimension rubric (problem relevance, judging alignment, user value, differentiation, feasibility, demonstrability, implementation time, reliability risk, data availability, potential impact)
- **Build Brief**: Structured spec from selected idea + requirements + gaps

### Authentication & Security
- **Clerk authentication**: Email/password, OAuth, MFA
- **Session management**: HttpOnly cookies, automatic refresh
- **Rate limiting**: Per-user/IP on API; per-process on AI/research calls
- **CSP**: Strict policy allowing Clerk, Cloudflare, Google Fonts
- **Helmet**: Security headers on all API responses
- **Secret scanning**: Blocks evidence containing API keys, tokens, private keys

### Developer Experience
- **Command palette**: `⌘K` (UI only, not yet wired to actions)
- **Lazy routes**: Competitions, Intel, Planner, Workflow, Settings loaded on demand
- **Type-safe API client**: Generated from Zod schemas via Orval
- **Hot module replacement**: Vite dev server with Replit cartographer overlay

---

## Workflow & Lifecycle

### The 10 Lifecycle Stages

```mermaid
stateDiagram-v2
    [*] --> intake : Competition created
    intake --> research : Scope locked
    research --> ideas : Findings gathered
    ideas --> build : Idea selected & challenged
    build --> quality : Core product built
    quality --> deployment : Checks passed
    deployment --> demo : URL verified
    demo --> submission : Demo rehearsed
    submission --> retrospective : All items audited
    retrospective --> [*] : Lessons captured

    %% Blocked can happen from any active state
    intake --> blocked
    research --> blocked
    ideas --> blocked
    build --> blocked
    quality --> blocked
    deployment --> blocked
    demo --> blocked
    submission --> blocked
    retrospective --> blocked

    blocked --> intake : Blocker resolved
    blocked --> research : Blocker resolved
    blocked --> ideas : Blocker resolved
    blocked --> build : Blocker resolved
    blocked --> quality : Blocker resolved
    blocked --> deployment : Blocker resolved
    blocked --> demo : Blocker resolved
    blocked --> submission : Blocker resolved
    blocked --> retrospective : Blocker resolved

    %% Retrospective unlock rule
    note right of retrospective
        Unlocks when:
        1. All submission tasks = done
        2. OR competition deadline passed
    end note
```

### Stage Definitions (from `artifacts/hackathon-os/src/lib/workflow.ts`)

| Stage ID | Label | Plan Phases | Summary | Unlock Rule |
|----------|-------|-------------|---------|-------------|
| `intake` | Intake & Scope | `intake`, `problem` | Confirm official rules, lock smallest credible scope | Always available |
| `research` | Research | `research` | Gather source-backed findings, separate facts from assumptions | After Intake tasks exist |
| `ideas` | Ideas | `track_selection`, `idea_selection` | Choose track, challenge one idea | After Research tasks exist |
| `build` | Build Workspace | `specification`, `architecture`, `implementation` | Write spec, build smallest complete product | After Ideas tasks exist |
| `quality` | Testing & Security | `testing`, `security` | Run real checks, review private data access | After Build tasks exist |
| `deployment` | Deployment | `deployment` | Publish app, verify production URL | After Quality tasks exist |
| `demo` | Demo & Pitch | `demo`, `pitch` | Rehearse demo, prepare pitch | After Deployment tasks exist |
| `submission` | Submission | `submission` | Audit every required item | After Demo tasks exist |
| `retrospective` | Retrospective | `retrospective_what_worked`, `retrospective_what_failed`, `retrospective_lessons_learned`, `retrospective_next_steps` | Capture lessons; unlocks when Submission complete or deadline passed | **Submission complete** OR **deadline passed** |
| `settings` | Settings & Integrations | — | Workspace name, defaults, tools, danger zone | **Separate page** (`/settings`), always accessible |

### Task & Evidence Status Model

```mermaid
stateDiagram-v2
    [*] --> todo : Task created
    todo --> in_progress : Start work
    in_progress --> todo : Pause
    in_progress --> blocked : Blocker found
    in_progress --> done : Mark complete
    blocked --> in_progress : Blocker resolved
    blocked --> todo : Replan
    done --> verified : Evidence satisfies method
    done --> todo : Reopen
    verified --> done : Evidence stale (requirement changed)
    done --> deferred : Defer
    deferred --> todo : Reschedule
```

### Quality Signals (from API `/overview`)

| Signal | Values | Meaning |
|--------|--------|---------|
| `applicationBuild` | `not_run` \| `passed` \| `failed` | Build command executed |
| `automatedTests` | `not_run` \| `passed` \| `failed` | Test suite executed |
| `browserVerification` | `not_run` \| `passed` \| `failed` | Playwright/visual check |
| `securityReview` | `not_run` \| `passed` \| `failed` | Manual security audit |
| `deployment` | `not_run` \| `passed` \| `failed` | Deploy command executed |
| `demoReadiness` | `not_run` \| `passed` \| `failed` | Demo rehearsed from clean state |
| `submissionReadiness` | `not_run` \| `passed` \| `failed` | All deliverables confirmed |

> Currently all signals are `not_run` — the API surface exists for future CI integration.

---

## Architecture

### System Context

```mermaid
graph TD
    subgraph Browser
        UI[React + Vite SPA\nartifacts/hackathon-os]
    end

    subgraph Vercel
        Static[Static Hosting\nartifacts/hackathon-os/dist/public]
        Fn[Serverless Function\napi/index.mjs → @workspace/api-server]
    end

    subgraph External
        PG[(Neon PostgreSQL)]
        Clerk[Clerk Auth]
        AI[OpenAI / Compatible]
        Search[DuckDuckGo / Exa / Brave / Serper]
    end

    UI --> Static
    UI --> Fn
    Fn --> PG
    Fn --> Clerk
    Fn --> AI
    Fn --> Search
    UI --> Clerk
```

### Authenticated API Call Sequence

```mermaid
sequenceDiagram
    participant U as User
    participant B as Browser (SPA)
    participant V as Vercel Edge
    participant F as Serverless Fn (Express)
    participant D as Neon PG
    participant C as Clerk

    U->>B: Clicks "Generate Plan"
    B->>V: POST /api/competitions/123/plans\nCookie: __session=...
    V->>F: Forward request
    F->>C: verifyToken(__session)
    C-->>F: { userId, sessionId }
    F->>D: SELECT * FROM competitions WHERE id=123 AND ownerId=userId
    D-->>F: Competition row
    F->>D: INSERT INTO workflow_plans... (transaction)
    F->>D: INSERT INTO workflow_tasks... (batch)
    F->>D: SELECT * FROM workflow_evidence WHERE competitionId=123
    D-->>F: Evidence rows
    F->>F: evaluateTaskVerification() for each task
    F-->>B: 201 { plan, tasks[], verification[] }
    B-->>U: Planner UI updates
```

### Monorepo Dependency Graph

```mermaid
graph TD
    Root[workspace (root)]
    Root --> FE[@workspace/hackathon-os\nartifacts/hackathon-os]
    Root --> API[@workspace/api-server\nartifacts/api-server]
    Root --> DB[@workspace/db\nlib/db]
    Root --> Zod[@workspace/api-zod\nlib/api-zod]
    Root --> Client[@workspace/api-client-react\nlib/api-client-react]
    Root --> Spec[@workspace/api-spec\nlib/api-spec]
    Root --> Scripts[@workspace/scripts\nscripts]

    FE --> Client
    FE --> Zod
    FE --> DB

    API --> DB
    API --> Zod
    API --> Client

    Client --> Zod
    Spec --> Zod
```

### Build & Deploy Pipeline

```mermaid
flowchart LR
    Install[pnpm install\n--frozen-lockfile]
    Typecheck[pnpm run typecheck\n→ tsc --build + per-package]
    BuildAPI[pnpm --filter @workspace/api-server run build\n→ esbuild → dist/index.mjs]
    BuildFE[pnpm --filter @workspace/hackathon-os run build\n→ Vite → dist/public]
    Copy[cp artifacts/api-server/dist/app.mjs api/bundle.mjs]
    Deploy[Vercel: buildCommand = pnpm run build\noutputDirectory = artifacts/hackathon-os/dist/public]

    Install --> Typecheck
    Typecheck --> BuildAPI
    Typecheck --> BuildFE
    BuildAPI --> Copy
    BuildFE --> Deploy
    Copy --> Deploy
```

---

## Data Model

### Entity-Relationship Diagram

```mermaid
erDiagram
    COMPETITIONS ||--o{ WORKFLOW_PLANS : "has"
    COMPETITIONS ||--o{ WORKFLOW_TASKS : "has"
    COMPETITIONS ||--o{ WORKFLOW_EVIDENCE : "has"
    COMPETITIONS ||--o{ COMPETITION_ANALYSES : "has"
    COMPETITIONS ||--o{ RESEARCH_FINDINGS : "has"
    COMPETITIONS ||--o{ RESEARCH_GAPS : "has"
    COMPETITIONS ||--o{ IDEA_CANDIDATES : "has"
    COMPETITIONS ||--o{ IDEA_RUBRICS : "has"
    COMPETITIONS ||--o{ BUILD_BRIEFS : "has"
    WORKFLOW_PLANS ||--o{ WORKFLOW_TASKS : "contains"
    WORKFLOW_TASKS ||--o{ WORKFLOW_EVIDENCE : "referenced by"
    COMPETITION_ANALYSES ||--o{ ANALYSIS_REQUIREMENTS : "contains"
    IDEA_CANDIDATES ||--o{ IDEA_EVALUATIONS : "evaluated by"
    IDEA_RUBRICS ||--o{ IDEA_EVALUATIONS : "weights for"

    COMPETITIONS {
        uuid id PK
        text owner_id
        text name
        text organizer
        text competition_type
        timestamp start_at
        timestamp deadline
        int team_size
        text track_mode
        text current_track
        text problem_statement
        text official_url
        text rules_url
        text[] mandatory_deliverables
        text[] team_skills
        int idea_complexity
        text status
        timestamp created_at
        timestamp updated_at
    }

    WORKFLOW_PLANS {
        uuid id PK
        uuid competition_id FK
        int version
        timestamp generated_at
        timestamp deadline
        int available_minutes
        int buffer_minutes
        text status
        text[] warnings
        text trigger
    }

    WORKFLOW_TASKS {
        uuid id PK
        uuid competition_id FK
        uuid plan_id FK
        text task_key
        text title
        text description
        text phase
        text priority
        int estimated_minutes
        timestamp planned_start_at
        timestamp planned_end_at
        text[] dependencies
        text owner
        text status
        text[] acceptance_criteria
        text expected_artifact
        text verification_method
        text risk_if_skipped
        boolean mandatory
    }

    WORKFLOW_EVIDENCE {
        uuid id PK
        uuid competition_id FK
        uuid task_id FK "nullable"
        text task_key
        text type
        text summary
        text source_url
        text command_name
        text result "passed|failed"
        timestamp observed_at
        text reviewer_note
        text source "manual"
        text phase_snapshot
        text verification_method_snapshot
        timestamp created_at
        timestamp updated_at
    }

    COMPETITION_ANALYSES {
        uuid id PK
        uuid competition_id FK
        int version
        text core_problem
        text[] missing_fields
        text[] unanswered_questions
        text method "DETERMINISTIC|AI_ASSISTED"
        text provider
        text model
        timestamp created_at
        timestamp updated_at
    }

    ANALYSIS_REQUIREMENTS {
        uuid id PK
        uuid analysis_id FK
        text category
        text text
        text claim_kind "INFERENCE|SOURCE_SUPPORTED|HYPOTHESIS"
        text source "AI_INFERENCE|MANUAL|COMPETITION_FIELD"
        text origin
        boolean reviewed
        timestamp created_at
        timestamp updated_at
    }

    RESEARCH_FINDINGS {
        uuid id PK
        uuid competition_id FK
        text title
        text source_url
        text provider
        text source_type "TECHNICAL_APPROACH|..."
        timestamp retrieved_at
        text summary
        text excerpt
        text supports
        text limitations
        text claim_kind "SOURCE_SUPPORTED|INFERENCE|HYPOTHESIS"
        text query
        boolean manual
        timestamp created_at
        timestamp updated_at
    }

    RESEARCH_GAPS {
        uuid id PK
        uuid competition_id FK
        text need
        text target_user
        text[] supporting_finding_ids
        text existing_approaches
        text insufficiency
        text opportunity
        text[] risks
        text claim_kind "HYPOTHESIS|INFERENCE|SOURCE_SUPPORTED"
        text[] evidence_gaps
        text[] next_investigations
        timestamp created_at
        timestamp updated_at
    }

    IDEA_CANDIDATES {
        uuid id PK
        uuid competition_id FK
        text name
        text pitch
        text target_user
        text problem_solved
        text proposed_solution
        text differentiator
        text core_user_journey
        text[] mvp_features
        text[] excluded_features
        text architecture_suggestion
        text data_and_integrations
        text feasibility_note
        text[] risks
        text demo_strategy
        text[] supporting_evidence
        text[] unverified_assumptions
        text claim_kind "INFERENCE|HYPOTHESIS"
        text status "candidate|selected|rejected"
        text decision_rationale
        timestamp created_at
        timestamp updated_at
    }

    IDEA_EVALUATIONS {
        uuid id PK
        uuid idea_id FK
        text dimension
        int score "1-5"
        int weight
        text rationale
        text[] evidence_refs
        text[] uncertainties
        text confidence "LOW|MEDIUM|HIGH"
        timestamp created_at
        timestamp updated_at
    }

    IDEA_RUBRICS {
        uuid id PK
        uuid competition_id FK
        jsonb weights
        timestamp created_at
        timestamp updated_at
    }

    BUILD_BRIEFS {
        uuid id PK
        uuid competition_id FK
        uuid idea_id FK "nullable"
        text idea_name
        jsonb content
        text[] missing_sections
        text claim_kind "INFERENCE|HYPOTHESIS|SOURCE_SUPPORTED"
        text method "DETERMINISTIC|AI_ASSISTED"
        text provider
        text model
        timestamp created_at
        timestamp updated_at
    }
```

### Table Descriptions

| Table | Purpose |
|-------|---------|
| `competitions` | Root workspace entity; one per hackathon event |
| `workflow_plans` | Versioned plan generated from deadline + available time |
| `workflow_tasks` | Individual tasks belonging to a plan; phased, prioritized, estimated |
| `workflow_evidence` | Verification records; manual today, supports future automation |
| `competition_analyses` | Problem analysis with deterministic + AI-assisted requirements |
| `analysis_requirements` | Individual requirements extracted from competition record |
| `research_findings` | Source-backed findings from web search or manual entry |
| `research_gaps` | Opportunities identified from findings + requirements |
| `idea_candidates` | Product ideas with MVP scope, risks, differentiators |
| `idea_evaluations` | Dimension scores (1–5) per idea per rubric dimension |
| `idea_rubrics` | Team-defined dimension weights per competition |
| `build_briefs` | Structured build specification from selected idea |

---

## Tech Stack

| Layer | Technology | Version | Source |
|-------|------------|---------|--------|
| **Frontend** | React | 19.1.4 | `pnpm-workspace.yaml` catalog |
| | Vite | 7.3.2 | `pnpm-workspace.yaml` catalog |
| | Tailwind CSS | 4.1.14 | `pnpm-workspace.yaml` catalog |
| | TanStack Query | 5.90.21 | `pnpm-workspace.yaml` catalog |
| | Wouter (router) | 3.3.5 | `pnpm-workspace.yaml` catalog |
| | Radix UI | 1.2.x | `artifacts/hackathon-os/package.json` |
| | Lucide React | 0.545.0 | `pnpm-workspace.yaml` catalog |
| | Clerk React | 6.17.8 | `artifacts/hackathon-os/package.json` |
| **Backend** | Express | 5.2.1 | `artifacts/api-server/package.json` |
| | Clerk Express | 2.1.78 | `artifacts/api-server/package.json` |
| | Drizzle ORM | 0.45.2 | `pnpm-workspace.yaml` catalog |
| | Zod | 4.6.7 | `pnpm-workspace.yaml` catalog |
| | Helmet | 8.3.0 | `artifacts/api-server/package.json` |
| | Pino / Pino-HTTP | 9.14.0 / 10.5.0 | `artifacts/api-server/package.json` |
| | express-rate-limit | 8.7.1 | `artifacts/api-server/package.json` |
| **Database** | PostgreSQL (Neon) | 16+ | `vercel.json` + `DEPLOYMENT.md` |
| | pg (driver) | 8.23.0 | `lib/db/package.json` |
| | Drizzle Kit | 0.31.10 | `lib/db/package.json` |
| **Auth** | Clerk | 6.17.8 (FE) / 2.1.78 (BE) | package.json files |
| **Tooling** | TypeScript | 5.9.3 | `package.json` |
| | pnpm | 11.17.0 | `package.json` `packageManager` |
| | Node.js | 24.x | `package.json` `engines` |
| | Vite (build) | 7.3.2 | `pnpm-workspace.yaml` catalog |
| | esbuild (API) | 0.28.2 | `artifacts/api-server/package.json` |
| **Testing** | Vitest | 5.0.5 | `artifacts/hackathon-os/package.json` |
| | Playwright | 1.64.1 | `package.json` |
| | Node test runner | built-in | `package.json` scripts |
| **Hosting** | Vercel (static + serverless) | — | `vercel.json` |

---

## Project Structure

```
HackathonOS/
├── api/
│   ├── index.mjs              # Vercel serverless entry point
│   └── bundle.mjs             # Bundled Express app (copied at build)
├── artifacts/
│   ├── hackathon-os/          # Frontend (React + Vite)
│   │   ├── src/
│   │   │   ├── components/    # UI components (workspace, EvidencePanel, etc.)
│   │   │   ├── lib/           # workflow.ts, client-env.ts, validation
│   │   │   ├── pages/         # Overview, Competitions, Planner, Workflow, Intel, Settings
│   │   │   ├── main.tsx       # App bootstrap
│   │   │   └── App.tsx        # Routes + Clerk provider
│   │   ├── test/              # Vitest + Node test files
│   │   ├── vite.config.ts
│   │   └── tsconfig.json
│   ├── api-server/            # Backend (Express)
│   │   ├── src/
│   │   │   ├── routes/        # competitions, evidence, intel, health
│   │   │   ├── lib/           # planner, verification, intel/, logger, env-validation
│   │   │   ├── middlewares/   # auth
│   │   │   ├── app.ts         # Express app factory
│   │   │   └── index.ts       # Server entry (PORT required)
│   │   ├── build.mjs          # esbuild bundler
│   │   └── test/              # Node test files (API, planner, security, etc.)
│   └── mockup-sandbox/        # Design tool (not deployed)
├── lib/
│   ├── db/                    # Drizzle schema + migrations
│   │   ├── src/schema/
│   │   │   ├── competitions.ts
│   │   │   ├── workflow-plans.ts
│   │   │   ├── evidence.ts
│   │   │   ├── intel.ts       # analyses, research, ideas, evaluations, briefs
│   │   │   └── index.ts
│   │   ├── drizzle/           # SQL migration files
│   │   └── drizzle.config.ts
│   ├── api-client-react/      # TanStack Query hooks (generated via Orval)
│   ├── api-zod/               # Zod schemas (generated via Orval)
│   ├── api-spec/              # OpenAPI spec + Orval config
│   └── integrations/          # (empty, reserved)
├── scripts/
│   ├── smoke/                 # Playwright smoke tests
│   │   └── auth-smoke.test.ts
│   ├── smoke-api.mjs          # API health/readyz checks
│   └── post-merge.sh          # Git hook helper
├── vercel.json                # Vercel project config
├── pnpm-workspace.yaml        # Monorepo config + catalog
├── package.json               # Root scripts + engines
├── tsconfig.json              # Root TS config
├── DEPLOYMENT.md              # Deployment guide
├── FIX_LOG.md                 # Recent fix log
└── PROJECT_STATUS.md          # Status tracker
```

---

## Getting Started

### Prerequisites

- **Node.js 24.x** (see `engines` in root `package.json`)
- **pnpm 11.17.0** (see `packageManager` in root `package.json`)
- **PostgreSQL** (local or Neon/Supabase/Vercel Postgres)
- **Clerk application** (free tier works)

### Clone & Install

```bash
git clone https://github.com/Adib-07/HackathonOS.git
cd HackathonOS
pnpm install --frozen-lockfile
```

### Environment Setup

Create `.env` files in the relevant packages:

**Root** (for API server):
```bash
# .env (root)
DATABASE_URL=postgresql://user:pass@host:5432/dbname
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
PORT=8080
NODE_ENV=development
```

**Frontend** (`artifacts/hackathon-os/.env`):
```bash
# artifacts/hackathon-os/.env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
BASE_PATH=/
VITE_CLERK_PROXY_URL=http://localhost:8080/api/__clerk
```

### Database Setup

```bash
# Generate migration from schema changes (if needed)
cd lib/db
pnpm run generate

# Apply migrations
pnpm run migrate

# Or push schema directly (dev only — never in production)
pnpm run push
```

### Run in Development

**Terminal 1 — API Server:**
```bash
cd artifacts/api-server
PORT=8080 DATABASE_URL=... CLERK_SECRET_KEY=... CLERK_PUBLISHABLE_KEY=... pnpm run dev
```

**Terminal 2 — Frontend (proxies `/api` to API server):**
```bash
cd artifacts/hackathon-os
PORT=19678 BASE_PATH=/ API_PROXY_ORIGIN=http://127.0.0.1:8080 pnpm run dev
```

Open `http://localhost:19678` and sign in with your Clerk test user.

### Run Tests

```bash
# All tests (root)
pnpm test

# Frontend unit + component tests
cd artifacts/hackathon-os
pnpm test                    # Node test runner (workflow logic)
pnpm vitest run              # Vitest (component imports)

# API server tests
cd ../api-server
pnpm test                    # Builds then runs Node tests

# Smoke tests (requires live server + TEST_USER_EMAIL/PASSWORD)
pnpm smoke                   # Playwright against BASE_URL
```

### Build for Production

```bash
# From root
pnpm run build

# Outputs:
# - artifacts/hackathon-os/dist/public/ (frontend)
# - artifacts/api-server/dist/index.mjs (API)
# - api/bundle.mjs (copied for Vercel)
```

---

## Environment Variables

| Name | Required | Scope | Where Used | Example Placeholder | Notes |
|------|----------|-------|------------|---------------------|-------|
| `DATABASE_URL` | ✅ | Runtime | API server (`artifacts/api-server`) | `postgresql://user:pass@host:5432/dbname` | Neon, Supabase, Vercel Postgres, or local |
| `CLERK_SECRET_KEY` | ✅ | Runtime | API server | `sk_test_...` | Backend secret from Clerk dashboard |
| `CLERK_PUBLISHABLE_KEY` | ✅ | Runtime | API server | `pk_test_...` | Backend publishable from Clerk dashboard |
| `VITE_CLERK_PUBLISHABLE_KEY` | ✅ | **Build-time** | Frontend (`artifacts/hackathon-os`) | `pk_test_...` | **Baked into JS bundle** — must match Clerk app |
| `BASE_PATH` | ❌ | Build-time + Runtime | Both | `/` | Subpath deployment (e.g., `/hackathonos`) |
| `VITE_CLERK_PROXY_URL` | ❌ | Build-time | Frontend | `https://app.vercel.app/api/__clerk` | Clerk proxy for cookieless domains |
| `OPENAI_API_KEY` | ❌ | Runtime | API server (intel) | `sk-...` | Enables AI-assisted features |
| `OPENAI_BASE_URL` | ❌ | Runtime | API server (intel) | `https://api.openai.com/v1` | Custom OpenAI-compatible endpoint |
| `OPENAI_MODEL` | ❌ | Runtime | API server (intel) | `gpt-4o-mini` | Model for completions |
| `LOG_LEVEL` | ❌ | Runtime | API server | `info` | Pino log level |
| `PORT` | ❌ | Runtime | API server | `8080` | Required by `artifacts/api-server/src/index.ts` |
| `NODE_ENV` | ❌ | Runtime | Both | `development` | Affects Vite dev vs build behavior |

> **Critical**: Variables prefixed with `VITE_` are **public** and embedded in the frontend bundle at build time. Never put secrets in `VITE_*` variables.

---

## API Reference

All routes are under `/api`. Authentication required unless noted (Clerk session cookie).

### Health (No Auth)

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/healthz` | Liveness probe | `{ "status": "ok" }` |
| `GET` | `/readyz` | Readiness probe (DB) | `{ "status": "ready" }` or `503 { "status": "not ready", "error": "db unreachable" }` |

### Competitions

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| `GET` | `/overview` | ✅ | — | `GetOverviewResponse` |
| `GET` | `/competitions` | ✅ | — | `Competition[]` |
| `POST` | `/competitions` | ✅ | `CreateCompetitionBody` | `201 Competition` |
| `GET` | `/competitions/:id` | ✅ | — | `Competition` |
| `PATCH` | `/competitions/:id` | ✅ | `UpdateCompetitionBody` | `Competition` |
| `DELETE` | `/competitions/:id` | ✅ | — | `204` (not yet implemented) |

### Plans & Tasks

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| `GET` | `/competitions/:id/plans` | ✅ | — | `PlanSummary[]` |
| `POST` | `/competitions/:id/plans` | ✅ | `GeneratePlanBody` | `201 PlanWithTasks` |
| `GET` | `/competitions/:id/plans/:planId` | ✅ | — | `PlanWithTasks` |
| `PATCH` | `/competitions/:id/tasks/:taskId` | ✅ | `UpdateTaskBody { status }` | `TaskWithVerification` |

### Evidence

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| `GET` | `/competitions/:id/evidence` | ✅ | — | `EvidenceRecord[]` |
| `POST` | `/competitions/:id/tasks/:taskId/evidence` | ✅ | `CreateEvidenceBody` | `201 EvidenceRecord` |
| `DELETE` | `/competitions/:id/evidence/:evidenceId` | ✅ | — | `{ id, deleted: true }` |

### Intelligence (Intel)

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| `POST` | `/competitions/:id/analysis` | ✅ | — | `{ analysis, requirements[], grouped, note }` |
| `GET` | `/competitions/:id/analysis` | ✅ | — | `{ analysis, requirements[] }` |
| `PATCH` | `/competitions/:id/analysis/requirements/:reqId` | ✅ | `{ text, reviewed }` | `{ requirement }` |
| `POST` | `/competitions/:id/research` | ✅ | `{ query?, providers?, manual?, title?, summary?, sourceUrl?, ... }` | `{ findings[], providerOutcomes[], retrievedAt }` |
| `GET` | `/competitions/:id/research` | ✅ | — | `{ findings[] }` |
| `DELETE` | `/competitions/:id/research/:findingId` | ✅ | — | `{ id, deleted: true }` |
| `POST` | `/competitions/:id/gaps` | ✅ | — | `{ gaps[], evidenceGaps[], nextInvestigations[], method, provider, model, note }` |
| `GET` | `/competitions/:id/gaps` | ✅ | — | `{ gaps[] }` |
| `POST` | `/competitions/:id/ideas` | ✅ | — | `{ ideas[], provider, model }` |
| `GET` | `/competitions/:id/ideas` | ✅ | — | `{ ideas[], weights, comparison }` |
| `POST` | `/competitions/:id/ideas/:ideaId/evaluate` | ✅ | `{ scores[] }` | `{ evaluation, provider, model }` |
| `PUT` | `/competitions/:id/rubric` | ✅ | `{ weights }` | `{ rubric, weights, defaults }` |
| `POST` | `/competitions/:id/ideas/:ideaId/decision` | ✅ | `{ status: "selected"|"rejected", rationale }` | `{ idea }` |
| `POST` | `/competitions/:id/ideas/:ideaId/brief` | ✅ | — | `{ brief, missingSections, method, provider, model }` |
| `GET` | `/competitions/:id/briefs` | ✅ | — | `{ briefs[] }` |

### Error Format

All errors follow this shape:
```json
{ "error": "Human-readable message" }
```

| Status | When |
|--------|------|
| `400` | Validation failed (Zod) |
| `401` | Missing/invalid Clerk session |
| `404` | Resource not found or not owned |
| `429` | Rate limited (research: 8/min, AI: 12/min) |
| `500` | Unexpected server error |
| `503` | `/readyz` DB unreachable |

---

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full step-by-step guide.

### Quick Vercel Setup

1. **Import repo** in Vercel → `Adib-07/HackathonOS`
2. **Root Directory**: `.` (repository root)
3. **Build Command**: `pnpm run build` (from `vercel.json`)
4. **Output Directory**: `artifacts/hackathon-os/dist/public` (from `vercel.json`)
5. **Node Version**: 24.x (from `package.json` engines)
6. **Environment Variables**: Add all from [Environment Variables](#environment-variables)
7. **Clerk Domains**: Add production + preview URLs in Clerk Dashboard → Domains
8. **Deploy**: Push to `main`

### Troubleshooting Checklist

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `invalid_function_runtime` | Node 20 deprecated | Ensure `engines.node: "24.x"` in root `package.json` |
| Build ignores files | `.vercelignore` or `outputDirectory` mismatch | Verify `vercel.json` outputDirectory |
| CSP blocks assets | `Content-Security-Policy` too strict | Check `vercel.json` headers allow Clerk, Google Fonts, Cloudflare |
| `FUNCTION_INVOCATION_FAILED` | API server crashes on start | Check `PORT` env var, `DATABASE_URL`, Clerk keys |
| Missing `DATABASE_URL` | Not set in Vercel | Add to Project Settings → Environment Variables |
| Misnamed env var | `VITE_` vs non-`VITE_` | `VITE_*` = build-time public; others = runtime secret |
| Clerk domain not allowed | Preview domain not in Clerk | Add `*.vercel.app` or specific preview URL in Clerk Domains |

---

## Testing

### Test Types & Commands

| Suite | Location | Command | Coverage |
|-------|----------|---------|----------|
| Workflow logic (pure) | `artifacts/hackathon-os/test/workflow.test.mjs` | `pnpm test` | 40 tests: stages, state derivation, summaries, durations |
| Component imports | `artifacts/hackathon-os/test/components.test.tsx` | `pnpm vitest run` | 27 tests: shell, pages, modals |
| Competition validation | `artifacts/hackathon-os/test/competition-form-validation.test.mjs` | `pnpm test` | 12 tests: required fields, limits, URLs |
| API integration | `artifacts/api-server/test/*.test.mjs` | `pnpm --filter @workspace/api-server test` | 13 files: competitions, evidence, intel, planner, verification, security, rate-limit |
| Smoke (E2E) | `scripts/smoke/auth-smoke.test.ts` | `pnpm smoke` | Authenticated navigation, CSP, console errors, failed requests |

### Coverage

No automated coverage reporting configured. Run `pnpm vitest run --coverage` after installing `@vitest/coverage-v8` if desired.

---

## Security

### Implemented

- **Authentication**: Clerk session cookies, `requireAuthenticatedUser` middleware on all `/api/*` except health
- **Authorization**: Every query joins `competitions.owner_id = current_user_id`
- **Rate Limiting**: `express-rate-limit` per IP/user; in-process window limiters for research (8/min), AI (12/min), plan generation (5/min), write ops (30/min)
- **CORS**: Explicit allow-list via `ALLOWED_ORIGINS` env var; credentials only for allowed origins
- **Helmet**: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`
- **CSP**: Strict policy allowing Clerk, Cloudflare Challenges, Google Fonts, Clerk images/telemetry
- **Secret Scanning**: Evidence submission rejects strings matching API key, token, private key patterns
- **Input Validation**: All request bodies/params/queries validated with Zod schemas (`safeParse`)
- **Body Size Limits**: `express.json({ limit: BODY_SIZE_LIMIT })` default 1MB, configurable
- **Error Handling**: Centralized error handler; no stack traces or internal details in production
- **SQL Injection Prevention**: Drizzle ORM parameterized queries only
- **Dependency Security**: `pnpm-workspace.yaml` `minimumReleaseAge: 1440` (1-day delay on new npm versions); overrides for known vulnerabilities
- **Secret Detection**: `gitleaks` in CI; `.gitleaks.toml` with allowlist for test fixtures

### Planned / Not Yet Implemented

- [ ] CSP nonce/script-hash for inline scripts
- [ ] Audit logging for sensitive operations (delete competition, evidence)
- [ ] Secret rotation automation
- [ ] Penetration testing

### Reporting Vulnerabilities

See [SECURITY.md](./SECURITY.md) for responsible disclosure process.

---

## Performance

### Bundle Sizes (Production Build)

| Chunk | Size | Gzipped |
|-------|------|---------|
| `index-*.js` (main) | 77.57 kB | 21.80 kB |
| `clerk-*.js` | 313.57 kB | 91.83 kB |
| `radix-ui-*.js` | 67.27 kB | 23.25 kB |
| `utils-*.js` | 33.50 kB | 11.43 kB |
| `planner-*.js` | 19.63 kB | 5.90 kB |
| `workflow-*.js` | 10.36 kB | 2.84 kB |
| `settings-*.js` | 7.57 kB | 2.42 kB |
| `intel-*.js` | 27.34 kB | 7.81 kB |
| `lucide-*.js` | 12.36 kB | 4.50 kB |
| `tanstack-query-*.js` | 2.34 kB | 1.12 kB |

### Optimizations In Place

- **Code splitting**: Lazy routes for Competitions, Intel, Planner, Workflow, Settings
- **Manual chunks**: Clerk, Radix UI, TanStack Query, Lucide, Framer Motion, Charts, CMdk split into separate chunks
- **Tree shaking**: ES modules throughout, `sideEffects: false` where applicable
- **CSS**: Tailwind JIT + `tailwindcss/vite` plugin

### Opportunities

- [ ] Lazy-load `IntelPage` sub-routes (Analysis, Research, Gaps, Ideas, Brief)
- [ ] Virtualize long task lists in Planner
- [ ] Service worker for offline overview
- [ ] Image optimization (none currently used)

---

## Roadmap

### Shipped (v0.1.0)

- ✅ Competition workspace with deadline-aware planner
- ✅ 10 lifecycle stages with unlock rules
- ✅ Task/evidence ledger with verification states
- ✅ Intelligence engine (analysis, research, gaps, ideas, evaluation, briefs)
- ✅ Settings page (workspace identity, competition defaults, connected tools, danger zone)
- ✅ Retrospective stage with real phases and unlock logic
- ✅ Type-safe API client + Zod schemas
- ✅ Vercel deployment with CSP, health checks

### In Progress / Next

- [ ] **Retrospective task generation**: Planner should emit retrospective tasks when submission completes
- [ ] **Evidence CI integration**: GitHub Actions → POST `/evidence` for test runs, builds, deployments
- [ ] **Production Clerk keys**: Switch from test to live keys
- [ ] **Custom domain**: Configure `hackathonos.dev` or similar
- [ ] **Settings persistence**: Workspace name, competition defaults to DB

### Later

- [ ] Multi-user workspaces (team invites, role-based access)
- [ ] Real-time collaboration (Liveblocks / PartyKit)
- [ ] Mobile PWA wrapper
- [ ] Export/import competition data (JSON)
- [ ] Webhook integrations (GitHub, Slack, Linear)

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- Development setup
- Branch & commit conventions (Conventional Commits)
- PR checklist (typecheck, test, build, no secrets)
- Code style
- How to add a lifecycle stage or API route
- Bug report process

## Code of Conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) (Contributor Covenant 2.1).

## License

MIT © 2026 Adib. See [LICENSE](./LICENSE).

## Acknowledgements

- [Clerk](https://clerk.com) for authentication
- [Neon](https://neon.tech) for serverless PostgreSQL
- [Vercel](https://vercel.com) for hosting
- [Drizzle ORM](https://orm.drizzle.team) for type-safe SQL
- [TanStack Query](https://tanstack.com/query) for server state
- [Radix UI](https://radix-ui.com) for accessible primitives
- [Tailwind CSS](https://tailwindcss.com) for styling
- [Orval](https://orval.dev) for API client generation

## Contact

Open a [GitHub Issue](https://github.com/Adib-07/HackathonOS/issues) for bugs, feature requests, or questions. No personal email.