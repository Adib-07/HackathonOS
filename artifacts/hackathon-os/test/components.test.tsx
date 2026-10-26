import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// Test the pure workflow functions
import {
  LIFECYCLE_STAGES,
  buildStageSummaries,
  summarisePlan,
  deriveStageState,
  STAGE_STATE_LABELS,
  formatDuration,
  computeRemaining,
  type StageTask,
  type PlanTaskPhase,
  type PlanTaskStatus,
} from '@/lib/workflow';

// Mock modules at top level
vi.mock('@workspace/api-client-react', () => ({
  useGetOverview: () => ({
    data: { currentCompetition: null },
    isLoading: false,
    isError: false,
  }),
  useHealthCheck: () => ({
    data: { status: 'ok' },
    isLoading: false,
    isError: false,
  }),
  useGetCompetition: () => ({
    data: null,
    isLoading: false,
    isError: false,
  }),
  useListPlanVersions: () => ({
    data: [],
    isLoading: false,
    isError: false,
  }),
  useGetPlan: () => ({
    data: null,
    isLoading: false,
    isError: false,
  }),
  useGetCompetitions: () => ({
    data: [],
    isLoading: false,
    isError: false,
  }),
  useUpdateCompetition: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useDeleteCompetition: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useGeneratePlan: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useUpdateTask: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  getGetPlanQueryKey: () => [],
  getGetOverviewQueryKey: () => [],
  getListPlanVersionsQueryKey: () => [],
}));

vi.mock('@clerk/react', () => ({
  useUser: () => ({
    user: {
      id: 'user-1',
      firstName: 'Test',
      fullName: 'Test User',
      primaryEmailAddress: { emailAddress: 'test@example.com' },
      emailAddresses: [{ emailAddress: 'test@example.com' }],
    },
  }),
  useClerk: () => ({
    signOut: vi.fn(),
    addListener: vi.fn(() => vi.fn()),
  }),
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignIn: () => <div data-testid="sign-in">Sign In</div>,
  SignUp: () => <div data-testid="sign-up">Sign Up</div>,
  Show: ({ when, children }: { when: string; children: React.ReactNode }) =>
    when === 'signed-in' ? <>{children}</> : null,
}));

vi.mock('wouter', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href} data-testid={`link-${href}`}>{children}</a>
  ),
  useRoute: (pattern: string) => [null, {}],
  useLocation: () => ['/'],
  Router: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Switch: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Route: () => null,
  Redirect: () => null,
}));

vi.mock('@tanstack/react-query', () => ({
  QueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
    clear: vi.fn(),
  })),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    clear: vi.fn(),
  }),
}));

describe('workflow library - pure functions', () => {
  describe('LIFECYCLE_STAGES', () => {
    it('has 9 stages (Settings removed, Retrospective now has phases)', () => {
      expect(LIFECYCLE_STAGES).toHaveLength(9);
    });

    it('has Retrospective with real phases (not planned)', () => {
      const retrospective = LIFECYCLE_STAGES.find(s => s.id === 'retrospective');

      expect(retrospective?.planned).toBe(false);
      expect(retrospective?.phases).toEqual([
        'retrospective_what_worked',
        'retrospective_what_failed',
        'retrospective_lessons_learned',
        'retrospective_next_steps',
      ]);
    });

    it('has no Settings stage', () => {
      const settings = LIFECYCLE_STAGES.find(s => s.id === 'settings');
      expect(settings).toBeUndefined();
    });

    it('has 9 backed stages with phases (including Retrospective)', () => {
      const backedStages = LIFECYCLE_STAGES.filter(s => !s.planned);
      expect(backedStages).toHaveLength(9); // All 9 stages now have phases

      backedStages.forEach(stage => {
        expect(stage.phases.length).toBeGreaterThan(0);
        expect(stage.planned).toBe(false);
      });
    });
  });

  describe('STAGE_STATE_LABELS', () => {
    it('has correct labels for all states', () => {
      expect(STAGE_STATE_LABELS.planned).toBe('Planned');
      expect(STAGE_STATE_LABELS.not_started).toBe('Not started');
      expect(STAGE_STATE_LABELS.scheduled).toBe('Scheduled');
      expect(STAGE_STATE_LABELS.active).toBe('In progress');
      expect(STAGE_STATE_LABELS.blocked).toBe('Blocked');
      expect(STAGE_STATE_LABELS.complete).toBe('Complete');
      expect(STAGE_STATE_LABELS.verified).toBe('Verified');
    });
  });

  describe('deriveStageState', () => {
    const createTask = (overrides: Partial<StageTask> = {}): StageTask => ({
      id: 'task-1',
      taskKey: 'test-task',
      title: 'Test Task',
      description: 'Test description',
      phase: 'intake' as PlanTaskPhase,
      priority: 'medium' as any,
      estimatedMinutes: 30,
      plannedStartAt: new Date().toISOString(),
      plannedEndAt: new Date(Date.now() + 3600000).toISOString(),
      dependencies: [],
      owner: null,
      status: 'todo' as PlanTaskStatus,
      acceptanceCriteria: [],
      expectedArtifact: null,
      verificationMethod: 'manual',
      riskIfSkipped: 'Low',
      mandatory: false,
      verified: false,
      ...overrides,
    });

    it('returns not_started for empty task list', () => {
      const result = deriveStageState([]);
      expect(result.state).toBe('not_started');
      expect(result.done).toBe(0);
      expect(result.completion).toBe(0);
    });

    it('returns blocked when any task is blocked', () => {
      const tasks = [
        createTask({ status: 'blocked' }),
        createTask({ status: 'todo', id: 'task-2' }),
      ];
      const result = deriveStageState(tasks);
      expect(result.state).toBe('blocked');
      expect(result.blocked).toBe(1);
    });

    it('returns verified when all tasks are verified', () => {
      const tasks = [
        createTask({ status: 'done', verified: true }),
        createTask({ status: 'done', verified: true, id: 'task-2' }),
      ];
      const result = deriveStageState(tasks);
      expect(result.state).toBe('verified');
      expect(result.verified).toBe(2);
    });

    it('returns complete when all tasks are done but not verified', () => {
      const tasks = [
        createTask({ status: 'done', verified: false }),
        createTask({ status: 'done', verified: false, id: 'task-2' }),
      ];
      const result = deriveStageState(tasks);
      expect(result.state).toBe('complete');
    });

    it('returns active when any task is in_progress', () => {
      const tasks = [
        createTask({ status: 'in_progress' }),
        createTask({ status: 'todo', id: 'task-2' }),
      ];
      const result = deriveStageState(tasks);
      expect(result.state).toBe('active');
      expect(result.inProgress).toBe(1);
    });

    it('returns scheduled when tasks exist but none started', () => {
      const tasks = [
        createTask({ status: 'todo' }),
        createTask({ status: 'todo', id: 'task-2' }),
      ];
      const result = deriveStageState(tasks);
      expect(result.state).toBe('scheduled');
      expect(result.todo).toBe(2);
    });
  });

  describe('buildStageSummaries', () => {
    const createTask = (overrides: Partial<StageTask> = {}): StageTask => ({
      id: 'task-1',
      taskKey: 'test-task',
      title: 'Test Task',
      description: 'Test description',
      phase: 'intake' as PlanTaskPhase,
      priority: 'medium' as any,
      estimatedMinutes: 30,
      plannedStartAt: new Date().toISOString(),
      plannedEndAt: new Date(Date.now() + 3600000).toISOString(),
      dependencies: [],
      owner: null,
      status: 'todo' as PlanTaskStatus,
      acceptanceCriteria: [],
      expectedArtifact: null,
      verificationMethod: 'manual',
      riskIfSkipped: 'Low',
      mandatory: false,
      verified: false,
      ...overrides,
    });

    it('returns not_started for backed stages with no tasks', () => {
      const tasks: StageTask[] = [];
      const summaries = buildStageSummaries(tasks);

      const intake = summaries.find(s => s.definition.id === 'intake');
      expect(intake?.state).toBe('not_started');
    });

    it('returns locked (planned) for Retrospective when Submission incomplete and deadline future', () => {
      const tasks: StageTask[] = [];
      const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const summaries = buildStageSummaries(tasks, futureDeadline);

      const retrospective = summaries.find(s => s.definition.id === 'retrospective');
      expect(retrospective?.state).toBe('planned');
      expect(retrospective?.total).toBe(0);
    });

    it('unlocks Retrospective when Submission stage is complete', () => {
      const tasks: StageTask[] = [
        createTask({
          id: 'sub-1',
          taskKey: 'submission-audit',
          title: 'Audit submission',
          phase: 'submission',
          status: 'done',
        }),
      ];
      const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const summaries = buildStageSummaries(tasks, futureDeadline);

      const retrospective = summaries.find(s => s.definition.id === 'retrospective');
      expect(retrospective?.state).toBe('not_started'); // Unlocked but no retrospective tasks yet
      expect(retrospective?.total).toBe(0);
    });

    it('unlocks Retrospective when deadline has passed', () => {
      const tasks: StageTask[] = [];
      const pastDeadline = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const summaries = buildStageSummaries(tasks, pastDeadline);

      const retrospective = summaries.find(s => s.definition.id === 'retrospective');
      expect(retrospective?.state).toBe('not_started'); // Unlocked but no retrospective tasks yet
      expect(retrospective?.total).toBe(0);
    });

    it('tracks Retrospective tasks when unlocked', () => {
      const tasks: StageTask[] = [
        createTask({
          id: 'sub-1',
          taskKey: 'submission-audit',
          title: 'Audit submission',
          phase: 'submission',
          status: 'done',
        }),
        createTask({
          id: 'retro-1',
          taskKey: 'what-worked',
          title: 'What worked well',
          phase: 'retrospective_what_worked',
          status: 'done',
        }),
        createTask({
          id: 'retro-2',
          taskKey: 'what-failed',
          title: 'What failed',
          phase: 'retrospective_what_failed',
          status: 'in_progress',
        }),
      ];
      const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const summaries = buildStageSummaries(tasks, futureDeadline);

      const retrospective = summaries.find(s => s.definition.id === 'retrospective');
      expect(retrospective?.state).toBe('active');
      expect(retrospective?.total).toBe(2);
      expect(retrospective?.done).toBe(1);
      expect(retrospective?.inProgress).toBe(1);
      expect(retrospective?.completion).toBe(50);
    });
  });

  describe('summarisePlan', () => {
    it('returns zero counts for empty plan', () => {
      const result = summarisePlan([]);
      expect(result.total).toBe(0);
      expect(result.done).toBe(0);
      expect(result.completion).toBe(0);
      expect(result.remainingMinutes).toBe(0);
    });

    it('calculates correct totals', () => {
      const tasks: StageTask[] = [
        { id: '1', taskKey: 'a', title: 'A', description: '', phase: 'intake', priority: 'medium', estimatedMinutes: 30, plannedStartAt: '', plannedEndAt: '', dependencies: [], owner: null, status: 'done', acceptanceCriteria: [], expectedArtifact: null, verificationMethod: '', riskIfSkipped: '', mandatory: false },
        { id: '2', taskKey: 'b', title: 'B', description: '', phase: 'intake', priority: 'medium', estimatedMinutes: 60, plannedStartAt: '', plannedEndAt: '', dependencies: [], owner: null, status: 'in_progress', acceptanceCriteria: [], expectedArtifact: null, verificationMethod: '', riskIfSkipped: '', mandatory: false },
        { id: '3', taskKey: 'c', title: 'C', description: '', phase: 'intake', priority: 'medium', estimatedMinutes: 45, plannedStartAt: '', plannedEndAt: '', dependencies: [], owner: null, status: 'todo', acceptanceCriteria: [], expectedArtifact: null, verificationMethod: '', riskIfSkipped: '', mandatory: false },
      ];
      const result = summarisePlan(tasks);
      expect(result.total).toBe(3);
      expect(result.done).toBe(1);
      expect(result.inProgress).toBe(1);
      expect(result.todo).toBe(1);
      expect(result.completion).toBe(33); // 1/3 * 100 = 33
      expect(result.remainingMinutes).toBe(105); // 60 + 45
    });
  });

  describe('formatDuration', () => {
    it('formats minutes correctly', () => {
      expect(formatDuration(0)).toBe('0m');
      expect(formatDuration(30)).toBe('30m');
      expect(formatDuration(60)).toBe('1h');
      expect(formatDuration(90)).toBe('1h 30m');
      expect(formatDuration(120)).toBe('2h');
    });
  });

  describe('computeRemaining', () => {
    it('computes remaining time correctly', () => {
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      const result = computeRemaining(future);
      expect(result.isPast).toBe(false);
      expect(result.ms).toBeGreaterThan(0);
    });

    it('detects past deadline', () => {
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const result = computeRemaining(past);
      expect(result.isPast).toBe(true);
      expect(result.ms).toBeLessThan(0);
    });
  });
});

// Component rendering tests - basic smoke tests only (no vi.mock inside tests)
describe('Component imports - basic smoke tests', () => {
  it('imports WorkspaceShell without error', async () => {
    const { WorkspaceShell } = await import('@/components/workspace');
    expect(WorkspaceShell).toBeDefined();
  });

  it('imports OverviewPage without error', async () => {
    const { default: OverviewPage } = await import('@/pages/overview');
    expect(OverviewPage).toBeDefined();
  });

  it('imports WorkflowPage without error', async () => {
    const { default: WorkflowPage } = await import('@/pages/workflow');
    expect(WorkflowPage).toBeDefined();
  });

  it('imports CompetitionModal without error', async () => {
    const { CompetitionModal } = await import('@/components/CompetitionModal');
    expect(CompetitionModal).toBeDefined();
  });

  it('imports SettingsPage without error', async () => {
    const { default: SettingsPage } = await import('@/pages/settings');
    expect(SettingsPage).toBeDefined();
  });

  it('imports PlannerPage without error', async () => {
    const { default: PlannerPage } = await import('@/pages/planner');
    expect(PlannerPage).toBeDefined();
  });
});