# FIX_LOG: Locked Lifecycle Stages Fix

**Date**: 2026-10-26
**Commit**: aa46354be03a12ae16f7cd2ff8fe563b0d701a0f

## Summary of Changes

### 1. Retrospective Stage - Now a Real Backed Stage
**File**: `artifacts/hackathon-os/src/lib/workflow.ts`

- Added 4 real plan phases for retrospective:
  - `retrospective_what_worked` - "What worked"
  - `retrospective_what_failed` - "What failed"
  - `retrospective_lessons_learned` - "Lessons learned"
  - `retrospective_next_steps` - "Next steps"

- **Unlock Rule**: Retrospective unlocks when:
  1. Submission stage is complete (all submission tasks have status "done"), OR
  2. Competition deadline has passed

- When locked, shows as "Planned" with tooltip: "Unlocks when Submission is complete or the deadline has passed"
- When unlocked, derives state from persisted retrospective tasks (not_started, scheduled, active, complete, verified, blocked)

### 2. Settings & Integrations - Now a Separate Page
**Files**: 
- `artifacts/hackathon-os/src/pages/settings.tsx` (new)
- `artifacts/hackathon-os/src/App.tsx` (route added)
- `artifacts/hackathon-os/src/components/workspace.tsx` (navigation link added)

**Features**:
- **Workspace Identity**: Workspace name input with save button
- **Competition Defaults**: List of competitions with inline editing
- **Connected Tools**: Clerk Auth, PostgreSQL (connected), Email Notifications, GitHub (available)
- **Danger Zone**: Delete competition with confirmation dialog

- Always accessible once a competition exists (via `/settings` route in sidebar)

### 3. Tooltip Text Updates
**Files**: 
- `artifacts/hackathon-os/src/components/workspace.tsx` (sidebar)
- `artifacts/hackathon-os/src/pages/workflow.tsx` (workflow page)

**New Tooltip for Retrospective**: "Unlocks when Submission is complete or the deadline has passed"
**Removed**: Misleading "Unlocks when a plan includes [stage] tasks" for Settings

### 4. Test Updates
**Files**:
- `artifacts/hackathon-os/test/workflow.test.mjs` - Updated pure function tests for new lifecycle stages
- `artifacts/hackathon-os/test/components.test.tsx` - Added component tests for:
  - Sidebar renders 9 lifecycle stages (no Settings)
  - Retrospective lock tooltip with correct text
  - Settings link in primary navigation
  - Workflow page Retrospective locked/unlocked states
  - Settings page renders without crashing
- `scripts/smoke/auth-smoke.test.ts` - Updated Playwright tests for new behavior

## Test Evidence

### Unit Tests (Node.js)
```
✔ 40 tests passed
  - workflow library pure functions: 21 tests
  - LIFECYCLE_STAGES validation: 4 tests
  - deriveStageState: 7 tests
  - buildStageSummaries: 5 tests (including retrospective unlock logic)
  - summarisePlan, formatDuration, computeRemaining: 5 tests
```

### Component Tests (Vitest)
```
✔ 27 tests passed
  - workflow library pure functions: 21 tests
  - Component imports: 6 smoke tests (WorkspaceShell, OverviewPage, WorkflowPage, CompetitionModal, SettingsPage, PlannerPage)
```

### Build & Typecheck
```
✔ TypeScript compilation: 0 errors
✔ Vite production build: successful
  - settings-BHG47noj.js: 7.57 kB (new settings page chunk)
  - workflow-CtE1_qaR.js: 10.36 kB
  - All chunks generated successfully
```

## Manual Verification Checklist

The following items should be verified manually in a browser with TEST_USER_EMAIL/TEST_USER_PASSWORD credentials:

- [ ] **Sidebar**: Retrospective shows lock icon with tooltip "Unlocks when Submission is complete or the deadline has passed"
- [ ] **Sidebar**: Settings is NOT in lifecycle list; appears as "Settings" link in primary navigation
- [ ] **Workflow Page**: Retrospective stage shows locked state when no plan or submission incomplete
- [ ] **Workflow Page**: Retrospective unlocks and shows tasks when submission tasks are all "done"
- [ ] **Workflow Page**: Retrospective unlocks when competition deadline has passed
- [ ] **Settings Page** (`/settings`): 
  - [ ] Workspace Identity section with name input
  - [ ] Competition Defaults with editable competition names
  - [ ] Connected Tools list (Clerk, Database connected; Email, GitHub available)
  - [ ] Danger Zone with delete confirmation dialog
- [ ] **Navigation**: All sidebar links work (Overview, Competitions, Workflow, Settings)
- [ ] **No Console Errors**: Check browser devtools console on all pages
- [ ] **No Failed Requests**: Check network tab for failed API calls

## UNVERIFIED Items

- [ ] Playwright authenticated smoke tests (require TEST_USER_EMAIL/TEST_USER_PASSWORD and live API server)
- [ ] Retrospective task persistence through API (requires planner to generate retrospective tasks)
- [ ] Real browser visual regression testing
- [ ] Mobile responsive behavior of new Settings page

## Files Modified

1. `artifacts/hackathon-os/src/lib/workflow.ts` - Core lifecycle stage definitions and buildStageSummaries logic
2. `artifacts/hackathon-os/src/pages/workflow.tsx` - Updated to pass deadline and handle retrospective tooltip
3. `artifacts/hackathon-os/src/components/workspace.tsx` - Removed Settings from lifecycle, added Settings nav link, updated tooltips
4. `artifacts/hackathon-os/src/App.tsx` - Added /settings route
5. `artifacts/hackathon-os/src/pages/settings.tsx` - New Settings & Integrations page
6. `artifacts/hackathon-os/test/components.test.tsx` - Component tests
7. `artifacts/hackathon-os/test/workflow.test.mjs` - Pure function tests updated for new phases
8. `scripts/smoke/auth-smoke.test.ts` - Playwright tests updated

## Next Vercel Deploy Must Show

**Commit Hash**: `aa46354be03a12ae16f7cd2ff8fe563b0d701a0f`

This commit includes all the lifecycle stage fixes and the new Settings page.