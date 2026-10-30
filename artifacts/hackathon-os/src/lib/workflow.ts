/**
 * Lifecycle stage model.
 *
 * Every stage below is either:
 *   - `backed`: derived from real persisted plan tasks (`phase` + `status`),
 *   - `planned`: no persisted source exists yet, so it is reported as a roadmap
 *     item and never as completed work.
 *
 * The stage list is intentionally derived from the phases the planner already
 * persists, so the UI can never show a stage the data does not support.
 */

export type PlanTaskPhase =
  | "intake"
  | "problem"
  | "research"
  | "track_selection"
  | "idea_selection"
  | "specification"
  | "architecture"
  | "implementation"
  | "testing"
  | "security"
  | "deployment"
  | "demo"
  | "pitch"
  | "submission"
  | "retrospective_what_worked"
  | "retrospective_what_failed"
  | "retrospective_lessons_learned"
  | "retrospective_next_steps";

export type PlanTaskStatus =
  "todo" | "in_progress" | "blocked" | "done" | "deferred";

export type PlanTaskPriority = "critical" | "high" | "medium" | "low";

/** Minimal shape the stage helpers need. Matches the generated `PlanTask`. */
export interface StageTask {
  id: string;
  taskKey: string;
  title: string;
  description: string;
  phase: PlanTaskPhase;
  priority: PlanTaskPriority;
  estimatedMinutes: number;
  plannedStartAt: string | Date;
  plannedEndAt: string | Date;
  dependencies: string[];
  owner: string | null;
  status: PlanTaskStatus;
  acceptanceCriteria: string[];
  expectedArtifact: string | null;
  verificationMethod: string;
  riskIfSkipped: string;
  mandatory: boolean;
  /** True when the task's verification requirements are satisfied by evidence. */
  verified?: boolean;
}

export type StageId =
  | "intake"
  | "research"
  | "ideas"
  | "build"
  | "quality"
  | "deployment"
  | "demo"
  | "submission"
  | "retrospective";

/**
 * `backed` stages map to persisted plan phases.
 * `planned` stages have no persisted source and are shown as roadmap items.
 */
export type StageState =
  | "complete"
  | "active"
  | "blocked"
  | "scheduled"
  | "not_started"
  | "planned"
  | "verified";

export interface StageDefinition {
  id: StageId;
  label: string;
  /** Plan phases that feed this stage. Empty for planned stages. */
  phases: PlanTaskPhase[];
  /** One line describing what this stage covers. */
  summary: string;
  /** True when the stage has no persisted data source yet. */
  planned: boolean;
}

export const LIFECYCLE_STAGES: StageDefinition[] = [
  {
    id: "intake",
    label: "Intake & Scope",
    phases: ["intake", "problem"],
    summary: "Confirm the official rules and lock the smallest credible scope.",
    planned: false,
  },
  {
    id: "research",
    label: "Research",
    phases: ["research"],
    summary:
      "Gather source-backed findings and separate facts from assumptions.",
    planned: false,
  },
  {
    id: "ideas",
    label: "Ideas",
    phases: ["track_selection", "idea_selection"],
    summary:
      "Choose a track and challenge one idea before committing build time.",
    planned: false,
  },
  {
    id: "build",
    label: "Build Workspace",
    phases: ["specification", "architecture", "implementation"],
    summary: "Write the specification and build the smallest complete product.",
    planned: false,
  },
  {
    id: "quality",
    label: "Testing & Security",
    phases: ["testing", "security"],
    summary: "Run real checks and review access to private project data.",
    planned: false,
  },
  {
    id: "deployment",
    label: "Deployment",
    phases: ["deployment"],
    summary: "Publish the app and verify the real production URL.",
    planned: false,
  },
  {
    id: "demo",
    label: "Demo & Pitch",
    phases: ["demo", "pitch"],
    summary: "Rehearse the demonstration and prepare the pitch narrative.",
    planned: false,
  },
  {
    id: "submission",
    label: "Submission",
    phases: ["submission"],
    summary: "Audit every required item against the official instructions.",
    planned: false,
  },
  {
    id: "retrospective",
    label: "Retrospective",
    phases: [
      "retrospective_what_worked",
      "retrospective_what_failed",
      "retrospective_lessons_learned",
      "retrospective_next_steps",
    ],
    summary:
      "Capture what worked, what failed, lessons learned, and next steps. Unlocks when Submission is complete or the competition deadline has passed.",
    planned: false,
  },
];

export const STAGE_BY_ID: Record<StageId, StageDefinition> = Object.fromEntries(
  LIFECYCLE_STAGES.map((stage) => [stage.id, stage]),
) as Record<StageId, StageDefinition>;

/** Readable label for a stage state. */
export const STAGE_STATE_LABELS: Record<StageState, string> = {
  complete: "Complete",
  active: "In progress",
  blocked: "Blocked",
  scheduled: "Scheduled",
  not_started: "Not started",
  planned: "Planned",
  verified: "Verified",
};

export interface StageSummary {
  definition: StageDefinition;
  state: StageState;
  /** Total persisted tasks that belong to this stage. */
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
  todo: number;
  deferred: number;
  /** Tasks in this stage whose verification requirements are satisfied. */
  verified: number;
  /** Sum of estimated minutes for tasks in this stage. */
  estimatedMinutes: number;
  /** Tasks that are blocked, in their original order. */
  blockers: StageTask[];
  /** The task to act on next, if any. */
  nextTask: StageTask | null;
  /** Percentage of this stage's tasks that are done, 0-100. */
  completion: number;
}

const ACTIVE_STATUSES: PlanTaskStatus[] = ["in_progress"];
const OPEN_STATUSES: PlanTaskStatus[] = ["todo", "in_progress", "blocked"];

function phaseMatches(task: StageTask, phases: PlanTaskPhase[]): boolean {
  return phases.includes(task.phase);
}

/**
 * Derive the state of a single stage from the tasks persisted for it.
 *
 * Rules, in priority order:
 *   - any blocked task        -> "blocked"
 *   - every task verified     -> "verified"
 *   - every task done         -> "complete"
 *   - any task in progress    -> "active"
 *   - tasks exist, none begun -> "scheduled"
 *   - no tasks at all         -> "not_started"
 *
 * A stage whose tasks are all done is "complete". It only becomes "verified"
 * when every task in it carries passing evidence.
 */
export function deriveStageState(tasks: StageTask[]): {
  state: StageState;
  done: number;
  inProgress: number;
  blocked: number;
  todo: number;
  deferred: number;
  verified: number;
  estimatedMinutes: number;
  blockers: StageTask[];
  nextTask: StageTask | null;
  completion: number;
} {
  const done = tasks.filter((task) => task.status === "done").length;
  const inProgress = tasks.filter((task) =>
    ACTIVE_STATUSES.includes(task.status),
  ).length;
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  const todo = tasks.filter((task) => task.status === "todo").length;
  const deferred = tasks.filter((task) => task.status === "deferred").length;
  const verified = tasks.filter((task) => task.verified).length;
  const estimatedMinutes = tasks.reduce(
    (sum, task) => sum + task.estimatedMinutes,
    0,
  );
  const blockers = tasks.filter((task) => task.status === "blocked");

  const openTasks = tasks.filter((task) => OPEN_STATUSES.includes(task.status));
  const nextTask =
    openTasks.find((task) => task.status === "in_progress") ??
    openTasks.find((task) => task.status === "blocked") ??
    openTasks.find((task) => task.status === "todo") ??
    null;

  let state: StageState;
  if (tasks.length === 0) {
    state = "not_started";
  } else if (blocked > 0) {
    state = "blocked";
  } else if (verified === tasks.length) {
    state = "verified";
  } else if (done === tasks.length) {
    state = "complete";
  } else if (inProgress > 0) {
    state = "active";
  } else {
    // Tasks exist and are scheduled, but nothing has actually started.
    state = "scheduled";
  }

  return {
    state,
    done,
    inProgress,
    blocked,
    todo,
    deferred,
    verified,
    estimatedMinutes,
    blockers,
    nextTask,
    completion:
      tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
  };
}

/**
 * Build the full stage list for a set of persisted plan tasks.
 * Planned stages are always reported as "planned" and never carry counts.
 * The retrospective stage unlocks when Submission is complete or the competition deadline has passed.
 */
export function buildStageSummaries(
  tasks: StageTask[],
  competitionDeadline?: string | Date,
): StageSummary[] {
  const now = new Date();
  const deadline = competitionDeadline ? new Date(competitionDeadline) : null;
  const isPastDeadline = deadline ? now > deadline : false;

  // Check if submission stage is complete
  const submissionTasks = tasks.filter((task) => task.phase === "submission");
  const submissionComplete =
    submissionTasks.length > 0 &&
    submissionTasks.every((task) => task.status === "done");

  const retrospectiveUnlocked = submissionComplete || isPastDeadline;

  return LIFECYCLE_STAGES.map((definition) => {
    // Handle retrospective unlock logic
    if (definition.id === "retrospective") {
      if (!retrospectiveUnlocked) {
        return {
          definition,
          state: "planned" as StageState,
          total: 0,
          done: 0,
          inProgress: 0,
          blocked: 0,
          todo: 0,
          deferred: 0,
          verified: 0,
          estimatedMinutes: 0,
          blockers: [],
          nextTask: null,
          completion: 0,
        };
      }
      // Retrospective is unlocked - derive state from its tasks
      const stageTasks = tasks.filter((task) =>
        phaseMatches(task, definition.phases),
      );
      const derived = deriveStageState(stageTasks);

      return {
        definition,
        state: derived.state,
        total: stageTasks.length,
        done: derived.done,
        inProgress: derived.inProgress,
        blocked: derived.blocked,
        todo: derived.todo,
        deferred: derived.deferred,
        verified: derived.verified,
        estimatedMinutes: derived.estimatedMinutes,
        blockers: derived.blockers,
        nextTask: derived.nextTask,
        completion: derived.completion,
      };
    }

    if (definition.planned) {
      return {
        definition,
        state: "planned" as StageState,
        total: 0,
        done: 0,
        inProgress: 0,
        blocked: 0,
        todo: 0,
        deferred: 0,
        verified: 0,
        estimatedMinutes: 0,
        blockers: [],
        nextTask: null,
        completion: 0,
      };
    }

    const stageTasks = tasks.filter((task) =>
      phaseMatches(task, definition.phases),
    );
    const derived = deriveStageState(stageTasks);

    return {
      definition,
      state: derived.state,
      total: stageTasks.length,
      done: derived.done,
      inProgress: derived.inProgress,
      blocked: derived.blocked,
      todo: derived.todo,
      deferred: derived.deferred,
      verified: derived.verified,
      estimatedMinutes: derived.estimatedMinutes,
      blockers: derived.blockers,
      nextTask: derived.nextTask,
      completion: derived.completion,
    };
  });
}

/** Aggregate counts for the whole saved plan. */
export interface PlanProgress {
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
  todo: number;
  deferred: number;
  completion: number;
  estimatedMinutes: number;
  remainingMinutes: number;
}

export function summarisePlan(tasks: StageTask[]): PlanProgress {
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "done").length;
  const inProgress = tasks.filter(
    (task) => task.status === "in_progress",
  ).length;
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  const todo = tasks.filter((task) => task.status === "todo").length;
  const deferred = tasks.filter((task) => task.status === "deferred").length;
  const estimatedMinutes = tasks.reduce(
    (sum, task) => sum + task.estimatedMinutes,
    0,
  );
  const remainingMinutes = tasks
    .filter((task) => task.status !== "done" && task.status !== "deferred")
    .reduce((sum, task) => sum + task.estimatedMinutes, 0);

  return {
    total,
    done,
    inProgress,
    blocked,
    todo,
    deferred,
    completion: total === 0 ? 0 : Math.round((done / total) * 100),
    estimatedMinutes,
    remainingMinutes,
  };
}

/** Human readable duration, e.g. "1h 45m" or "30m". */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m";
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/**
 * Workspace gate hook - single source of truth for competition-dependent features.
 * Gate configuration for each feature area
 */
export const WORKSPACE_GATES = {
  workflow: {
    id: "workflow",
    label: "Workflow",
    unlockReason: "Create a competition workspace to unlock Workflow",
    unlockAction: "Create workspace",
  },
  planner: {
    id: "planner",
    label: "Planner",
    unlockReason: "Create a competition workspace to unlock Planner",
    unlockAction: "Create workspace",
  },
  intel: {
    id: "intel",
    label: "Intelligence",
    unlockReason: "Create a competition workspace to unlock Intelligence",
    unlockAction: "Create workspace",
  },
  competitions: {
    id: "competitions",
    label: "Competitions",
    unlockReason: null, // Always accessible
    unlockAction: null,
  },
  settings: {
    id: "settings",
    label: "Settings & Integrations",
    unlockReason: null, // Always accessible
    unlockAction: null,
  },
  retrospective: {
    id: "retrospective",
    label: "Retrospective",
    unlockReason:
      "Unlocks when Submission is complete or the competition deadline has passed",
    unlockAction: null,
  },
} as const;

export type WorkspaceGateId = keyof typeof WORKSPACE_GATES;

export interface RemainingTime {
  /** Raw milliseconds until the deadline. Negative once it has passed. */
  ms: number;
  isPast: boolean;
  /** True when under 24 hours remain. */
  isUrgent: boolean;
  /** True when under 2 hours remain. */
  isCritical: boolean;
  /** Compact label such as "2d 4h" or "Past deadline". */
  label: string;
  /** Long label such as "2 days 4 hours remaining". */
  longLabel: string;
}

/** Compute the time remaining until a deadline, relative to `now`. */
export function computeRemaining(
  deadline: string | Date,
  now: Date = new Date(),
): RemainingTime {
  const target = new Date(deadline).getTime();
  const ms = target - now.getTime();
  const isPast = ms < 0;
  const absMs = Math.abs(ms);
  const totalMinutes = Math.floor(absMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (parts.length === 0) parts.push(`${minutes}m`);

  const longParts: string[] = [];
  if (days > 0) longParts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours > 0) longParts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (longParts.length === 0) {
    longParts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  }

  return {
    ms,
    isPast,
    isUrgent: !isPast && absMs <= 24 * 60 * 60 * 1000,
    isCritical: !isPast && absMs <= 2 * 60 * 60 * 1000,
    label: parts.join(" "),
    longLabel: `${longParts.join(" ")} ${isPast ? "overdue" : "remaining"}`,
  };
}

/** Map a plan phase to the stage that owns it. */
export function stageIdForPhase(phase: PlanTaskPhase): StageId | null {
  const stage = LIFECYCLE_STAGES.find(
    (candidate) => !candidate.planned && candidate.phases.includes(phase),
  );
  return stage?.id ?? null;
}

/** Readable label for a persisted plan phase. */
export const PHASE_LABELS: Record<PlanTaskPhase, string> = {
  intake: "Intake",
  problem: "Problem definition",
  research: "Research",
  track_selection: "Track selection",
  idea_selection: "Idea selection",
  specification: "Specification",
  architecture: "Architecture",
  implementation: "Implementation",
  testing: "Testing",
  security: "Security",
  deployment: "Deployment",
  demo: "Demo",
  pitch: "Pitch",
  submission: "Submission",
  retrospective_what_worked: "What worked",
  retrospective_what_failed: "What failed",
  retrospective_lessons_learned: "Lessons learned",
  retrospective_next_steps: "Next steps",
};

export function phaseLabel(phase: string): string {
  return (
    PHASE_LABELS[phase as PlanTaskPhase] ??
    phase.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase())
  );
}
