# API Reference (Complete)

> Full API reference generated from route handlers and Zod schemas. See [README.md](../README.md#api-reference) for the summary table.

---

## Base URL

```
Production:  https://hackathonos-mu.vercel.app/api
Preview:     https://<deployment>.vercel.app/api
Local:       http://localhost:8080/api
```

All routes require **Clerk session cookie** except `/healthz` and `/readyz`.

---

## Authentication

- **Method**: HttpOnly cookie (`__session`) set by Clerk
- **Middleware**: `requireAuthenticatedUser` (all `/api/*` except health)
- **Authorization**: Every query joins `competitions.owner_id = current_user_id`
- **Unauthenticated**: Returns `401 { "error": "Unauthenticated" }`

---

## Health Endpoints (No Auth)

### GET `/healthz`

Liveness probe — process is running.

**Response 200**:
```json
{ "status": "ok" }
```

### GET `/readyz`

Readiness probe — database reachable.

**Response 200**:
```json
{ "status": "ready" }
```

**Response 503**:
```json
{ "status": "not ready", "error": "db unreachable" }
```

---

## Error Format

All errors:
```json
{ "error": "Human-readable message" }
```

| Status | Meaning |
|--------|---------|
| `400` | Validation failed (Zod `safeParse`) |
| `401` | Missing/invalid Clerk session |
| `404` | Resource not found or not owned |
| `429` | Rate limited (research: 8/min, AI: 12/min) |
| `500` | Unexpected server error |
| `503` | `/readyz` DB unreachable |

---

## Competitions

### GET `/overview`

Workspace dashboard: current competition, plan, next action, counts.

**Response 200** (`GetOverviewResponse`):
```typescript
{
  currentCompetition: Competition | null,
  currentPlan: PlanWithTasks | null,
  competitionCount: number,
  openTaskCount: number,
  completedTaskCount: number,
  nextAction: TaskWithVerification | null,
  quality: {
    applicationBuild: "not_run" | "passed" | "failed",
    automatedTests: "not_run" | "passed" | "failed",
    browserVerification: "not_run" | "passed" | "failed",
    securityReview: "not_run" | "passed" | "failed",
    deployment: "not_run" | "passed" | "failed",
    demoReadiness: "not_run" | "passed" | "failed",
    submissionReadiness: "not_run" | "passed" | "failed",
  }
}
```

---

### GET `/competitions`

List all competitions owned by user, ordered by deadline.

**Response 200**: `Competition[]`

**Competition** shape:
```typescript
{
  id: string (UUID),
  ownerId: string,
  name: string,
  organizer: string | null,
  competitionType: string,
  startAt: string (ISO) | null,
  deadline: string (ISO),
  teamSize: number,
  trackMode: "assigned" | "choose",
  currentTrack: string | null,
  problemStatement: string | null,
  officialUrl: string | null,
  rulesUrl: string | null,
  mandatoryDeliverables: string[],
  teamSkills: string[],
  ideaComplexity: number,
  status: "preparing" | "active" | "completed",
  createdAt: string (ISO),
  updatedAt: string (ISO),
}
```

---

### POST `/competitions`

Create a competition.

**Request** (`CreateCompetitionBody`):
```typescript
{
  name: string (required, 1-160 chars),
  organizer?: string,
  competitionType?: "hackathon" | "game-jam" | "ctf" | "research" | "other" | "unknown",
  startAt?: string (ISO),
  deadline: string (ISO, required, future),
  teamSize?: number (1-100, default 1),
  trackMode?: "assigned" | "choose" (default "choose"),
  currentTrack?: string,
  problemStatement?: string (max 5000 chars),
  officialUrl?: string (http/https),
  rulesUrl?: string (http/https),
  mandatoryDeliverables?: string[],
  teamSkills?: string[],
  ideaComplexity?: number (1-5, default 3),
  status?: "preparing" | "active" | "completed" (default "preparing"),
}
```

**Response 201**: `Competition`

**Response 400**: `{ "error": "Validation message" }`

---

### GET `/competitions/:competitionId`

Get single competition.

**Response 200**: `Competition`

**Response 404**: `{ "error": "Competition not found." }`

---

### PATCH `/competitions/:competitionId`

Update competition (partial).

**Request** (`UpdateCompetitionBody`): All fields optional, same types as create.

**Response 200**: `Competition`

**Response 400/404**: Error format

---

## Plans & Tasks

### GET `/competitions/:competitionId/plans`

List plan versions for a competition (newest first).

**Response 200** (`PlanSummary[]`):
```typescript
{
  id: string (UUID),
  competitionId: string,
  version: number,
  generatedAt: string (ISO),
  deadline: string (ISO),
  availableMinutes: number,
  bufferMinutes: number,
  status: "feasible" | "at_risk" | "infeasible",
  warnings: string[],
  trigger: "manual" | "auto" | "replan",
  taskCount: number,
  completedTaskCount: number,
}
```

---

### POST `/competitions/:competitionId/plans`

Generate a new plan version.

**Request** (`GeneratePlanBody`):
```typescript
{
  remainingHours?: number,  // Optional override for available time
  trigger: "manual" | "auto" | "replan",
}
```

**Response 201** (`PlanWithTasks`):
```typescript
{
  id: string,
  competitionId: string,
  version: number,
  generatedAt: string,
  deadline: string,
  availableMinutes: number,
  bufferMinutes: number,
  status: "feasible" | "at_risk" | "infeasible",
  warnings: string[],
  trigger: string,
  taskCount: number,
  completedTaskCount: number,
  tasks: TaskWithVerification[],
}
```

**TaskWithVerification**:
```typescript
{
  id: string,
  planId: string,
  taskKey: string,
  title: string,
  description: string,
  phase: PlanTaskPhase,
  priority: "critical" | "high" | "medium" | "low",
  estimatedMinutes: number,
  plannedStartAt: string,
  plannedEndAt: string,
  dependencies: string[],
  owner: string | null,
  status: PlanTaskStatus,
  acceptanceCriteria: string[],
  expectedArtifact: string | null,
  verificationMethod: string,
  riskIfSkipped: string,
  mandatory: boolean,
  verification: TaskVerification,
}
```

**TaskVerification**:
```typescript
{
  verified: boolean,
  method: string,
  sources: EvidenceSource[],
}
```

**Response 400**: Deadline passed, validation error

---

### GET `/competitions/:competitionId/plans/:planId`

Get specific plan with tasks and verification.

**Response 200**: `PlanWithTasks`

**Response 404**: Plan not found

---

### PATCH `/competitions/:competitionId/tasks/:taskId`

Update task status (only on latest plan version).

**Request** (`UpdateTaskBody`):
```typescript
{
  status: "todo" | "in_progress" | "blocked" | "done" | "deferred",
}
```

**Response 200**: `TaskWithVerification`

**Response 400/404**: Error format

---

## Evidence

### GET `/competitions/:competitionId/evidence`

List all evidence for a competition (newest first).

**Response 200** (`EvidenceRecord[]`):
```typescript
{
  id: string,
  competitionId: string,
  taskId: string | null,
  taskKey: string,
  type: EvidenceType,
  summary: string,
  sourceUrl: string | null,
  commandName: string | null,
  result: "passed" | "failed",
  observedAt: string (ISO),
  reviewerNote: string | null,
  source: "manual",
  phaseSnapshot: string,
  verificationMethodSnapshot: string,
  createdAt: string (ISO),
  updatedAt: string (ISO),
}
```

---

### POST `/competitions/:competitionId/tasks/:taskId/evidence`

Record evidence for a task.

**Request** (`CreateEvidenceBody`):
```typescript
{
  type: "test_run" | "build_output" | "manual_check" | "security_review" | "deployment_check" | "demo_rehearsal" | "submission_audit",
  summary: string (required),
  sourceUrl?: string (http/https),
  commandName?: string,
  result: "passed" | "failed",
  observedAt?: string (ISO, default now),
  reviewerNote?: string,
}
```

**Validation**:
- `type` must be in `EVIDENCE_TYPES`
- No secrets in any field (scanned via regex)
- `observedAt` not in future (+60s tolerance)

**Response 201**: `EvidenceRecord`

**Response 400**: `{ "error": "Evidence must not contain credentials, tokens, or private keys." }`

---

### DELETE `/competitions/:competitionId/evidence/:evidenceId`

Delete evidence (owner only).

**Response 200**:
```json
{ "id": "uuid", "deleted": true }
```

**Response 404**: Not found

---

## Intelligence (Intel)

All intel routes scoped to competition owner.

### Problem Analysis

#### POST `/competitions/:competitionId/analysis`

Run problem analysis (deterministic + AI).

**Response 201**:
```typescript
{
  analysis: CompetitionAnalysisRecord,
  requirements: AnalysisRequirementRecord[],
  grouped: GroupedRequirements,
  note: string | null,  // AI failure note if applicable
}
```

#### GET `/competitions/:competitionId/analysis`

Get latest analysis.

**Response 200**:
```typescript
{ analysis: CompetitionAnalysisRecord | null, requirements: AnalysisRequirementRecord[] }
```

#### PATCH `/competitions/:competitionId/analysis/requirements/:requirementId`

Edit requirement text or mark reviewed.

**Request**:
```typescript
{ text: string, reviewed: boolean }
```

**Response 200**: `{ requirement: AnalysisRequirementRecord }`

---

### Research

#### POST `/competitions/:competitionId/research`

Search web or record manual finding.

**Request (search)**:
```typescript
{
  query: string (3-300 chars),
  providers?: string[]  // subset of ["duckduckgo", "exa", "brave", "serper"]
}
```

**Request (manual)**:
```typescript
{
  manual: true,
  title: string,
  summary: string,
  sourceUrl?: string (http/https),
  sourceType?: "TECHNICAL_APPROACH" | "MARKET_DATA" | "COMPETITOR_ANALYSIS" | "BEST_PRACTICE" | "REGULATORY" | "USER_FEEDBACK",
  supports?: string,
  limitations?: string,
  excerpt?: string,
}
```

**Response 201**:
```typescript
{
  findings: ResearchFindingRecord[],
  providerOutcomes: { provider: string, ok: boolean, count: number, error: string | null }[],
  retrievedAt: string (ISO),
}
```

#### GET `/competitions/:competitionId/research`

List findings.

**Response 200**: `{ findings: ResearchFindingRecord[] }`

#### DELETE `/competitions/:competitionId/research/:findingId`

Delete finding.

**Response 200**: `{ id: string, deleted: true }`

---

### Gap Analysis

#### POST `/competitions/:competitionId/gaps`

Generate gaps from findings + requirements.

**Response 201**:
```typescript
{
  gaps: ResearchGapRecord[],
  evidenceGaps: string[],
  nextInvestigations: string[],
  method: "DETERMINISTIC" | "AI_ASSISTED",
  provider?: string,
  model?: string,
  note: string | null,
}
```

#### GET `/competitions/:competitionId/gaps`

List gaps.

**Response 200**: `{ gaps: ResearchGapRecord[] }`

---

### Ideas

#### POST `/competitions/:competitionId/ideas`

Generate idea candidates (requires AI provider).

**Response 201**:
```typescript
{
  ideas: IdeaCandidateRecord[],
  provider: string,
  model: string,
}
```

#### GET `/competitions/:competitionId/ideas`

List ideas with evaluations and comparison.

**Response 200**:
```typescript
{
  ideas: IdeaCandidateRecord[],
  weights: Record<string, number>,
  comparison: ComparisonResult,
}
```

**ComparisonResult**:
```typescript
{
  ranked: { ideaId: string, name: string, evaluation: IdeaEvaluation }[],
  best: string | null,
  notes: string[],
}
```

#### POST `/competitions/:competitionId/ideas/:ideaId/evaluate`

Score an idea (manual or AI).

**Request**:
```typescript
{
  scores: { dimension: string, score: number, rationale: string, evidenceRefs: string[], uncertainties: string[], confidence: "LOW" | "MEDIUM" | "HIGH" }[]
}
```

**Response 200**:
```typescript
{ evaluation: IdeaEvaluation, provider?: string, model?: string }
```

#### PUT `/competitions/:competitionId/rubric`

Set dimension weights (thousandths of percent).

**Request**:
```typescript
{ weights: Record<string, number> }
```

**Response 200**: `{ rubric, weights, defaults }`

#### POST `/competitions/:competitionId/ideas/:ideaId/decision`

Select or reject an idea.

**Request**:
```typescript
{ status: "selected" | "rejected", rationale: string }
```

**Response 200**: `{ idea: IdeaCandidateRecord }`

---

### Build Brief

#### POST `/competitions/:competitionId/ideas/:ideaId/brief`

Generate build brief from selected idea.

**Response 201**:
```typescript
{
  brief: BuildBriefRecord,
  missingSections: string[],
  method: "DETERMINISTIC" | "AI_ASSISTED",
  provider?: string,
  model?: string,
}
```

#### GET `/competitions/:competitionId/briefs`

List briefs.

**Response 200**: `{ briefs: BuildBriefRecord[] }`

---

## Schemas (Reference)

### PlanTaskPhase

```typescript
type PlanTaskPhase =
  | "intake" | "problem" | "research" | "track_selection" | "idea_selection"
  | "specification" | "architecture" | "implementation"
  | "testing" | "security" | "deployment" | "demo" | "pitch" | "submission"
  | "retrospective_what_worked" | "retrospective_what_failed"
  | "retrospective_lessons_learned" | "retrospective_next_steps";
```

### PlanTaskStatus

```typescript
type PlanTaskStatus = "todo" | "in_progress" | "blocked" | "done" | "deferred";
```

### EvidenceType

```typescript
type EvidenceType =
  | "test_run" | "build_output" | "manual_check" | "security_review"
  | "deployment_check" | "demo_rehearsal" | "submission_audit";
```

### ClaimKind

```typescript
type ClaimKind = "SOURCE_SUPPORTED" | "INFERENCE" | "HYPOTHESIS";
```

### IdeaDimension (10 dimensions)

```typescript
type IdeaDimension =
  | "PROBLEM_RELEVANCE" | "JUDGING_ALIGNMENT" | "USER_VALUE" | "DIFFERENTIATION"
  | "TECHNICAL_FEASIBILITY" | "DEMONSTRABILITY" | "IMPLEMENTATION_TIME"
  | "RELIABILITY_RISK" | "DATA_AVAILABILITY" | "POTENTIAL_IMPACT";
```

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/competitions/:id/research` (search) | 8 requests | 60 seconds |
| `/competitions/:id/analysis` | 12 requests | 60 seconds |
| `/competitions/:id/gaps` | 12 requests | 60 seconds |
| `/competitions/:id/ideas` | 12 requests | 60 seconds |
| `/competitions/:id/ideas/:id/evaluate` | 12 requests | 60 seconds |
| `/competitions/:id/ideas/:id/brief` | 12 requests | 60 seconds |

**Response 429**:
```json
{ "error": "Too many requests in a short time. Wait a minute and try again.", "code": "RATE_LIMITED" }
```

---

## Client Usage (TanStack Query)

```typescript
// Generated hooks from @workspace/api-client-react
import {
  useGetOverview,
  useGetCompetition,
  useListPlanVersions,
  useGeneratePlan,
  useGetPlan,
  useUpdateTask,
  useListEvidence,
  useCreateEvidence,
  // Intel
  useCreateAnalysis,
  useGetAnalysis,
  useCreateResearch,
  useListResearch,
  useCreateGaps,
  useListGaps,
  useCreateIdeas,
  useListIdeas,
  useEvaluateIdea,
  useUpdateRubric,
  useDecideIdea,
  useCreateBrief,
  useListBriefs,
} from "@workspace/api-client-react";
```

Each hook returns `{ data, isLoading, isError, error, refetch, mutate }`.

---

## OpenAPI Spec

The full OpenAPI 3.1 spec is at `lib/api-spec/openapi.yaml` (generated via Orval from Zod schemas).