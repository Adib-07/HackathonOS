import type { Competition } from "@workspace/db";
import type { WorkflowTaskRecord } from "@workspace/db";

export type PlanPhase =
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
  | "submission";

type PlanPriority = "critical" | "high" | "medium" | "low";
type PlanStatus = "feasible" | "at_risk" | "infeasible";
type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "deferred";

type TaskTemplate = {
  taskKey: string;
  title: string;
  description: string;
  phase: PlanPhase;
  priority: PlanPriority;
  weight: number;
  dependencies: string[];
  owner: string | null;
  status: TaskStatus;
  acceptanceCriteria: string[];
  expectedArtifact: string | null;
  verificationMethod: string;
  riskIfSkipped: string;
  mandatory: boolean;
};

type ScheduledTask = TaskTemplate & {
  estimatedMinutes: number;
  plannedStartAt: Date;
  plannedEndAt: Date;
};

export type PlanDraft = {
  status: PlanStatus;
  warnings: string[];
  bufferMinutes: number;
  tasks: ScheduledTask[];
};

const shortTemplates: TaskTemplate[] = [
  {
    taskKey: "lock-scope",
    title: "Lock rules, problem, and smallest credible scope",
    description:
      "Review the competition constraints, choose one user problem, and write down the smallest demoable outcome.",
    phase: "problem",
    priority: "critical",
    weight: 24,
    dependencies: [],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "The selected problem and intended user are written down.",
      "The scope fits the time left before the submission deadline.",
    ],
    expectedArtifact: "One-paragraph project scope",
    verificationMethod:
      "Check the scope against the recorded rules and deadline.",
    riskIfSkipped: "The team may build features that cannot be finished.",
    mandatory: false,
  },
  {
    taskKey: "build-core-demo",
    title: "Build the core user journey",
    description:
      "Implement the smallest complete product path that can be demonstrated from start to finish.",
    phase: "implementation",
    priority: "critical",
    weight: 58,
    dependencies: ["lock-scope"],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "The primary user journey works with real application behavior.",
      "The demo path can be repeated without relying on placeholder results.",
    ],
    expectedArtifact: "Working core application",
    verificationMethod:
      "Run the application and complete the primary user journey.",
    riskIfSkipped: "There may be no working product to show.",
    mandatory: false,
  },
  {
    taskKey: "verify-and-rehearse",
    title: "Verify, rehearse, and prepare the submission",
    description:
      "Run the available checks, rehearse the demo, and confirm each recorded deliverable against official rules.",
    phase: "submission",
    priority: "critical",
    weight: 18,
    dependencies: ["build-core-demo"],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "The primary journey has been checked in the running application.",
      "The demo has a repeatable start and finish.",
      "Every recorded deliverable has a place in the submission.",
    ],
    expectedArtifact: "Verified demo and submission checklist",
    verificationMethod:
      "Run the product, rehearse the demo, and compare each item with official rules.",
    riskIfSkipped: "The team may submit an incomplete or unreliable demo.",
    mandatory: true,
  },
];

const mediumTemplates: TaskTemplate[] = [
  {
    taskKey: "confirm-rules",
    title: "Confirm the official rules and deadline",
    description:
      "Review the official sources and record eligibility, constraints, and required submissions.",
    phase: "intake",
    priority: "critical",
    weight: 10,
    dependencies: [],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "The official rules URL and submission deadline are recorded.",
      "Known restrictions and deliverables are listed.",
    ],
    expectedArtifact: "Confirmed competition constraints",
    verificationMethod: "Compare recorded details with the official source.",
    riskIfSkipped: "An overlooked rule can invalidate an otherwise strong entry.",
    mandatory: false,
  },
  {
    taskKey: "choose-problem",
    title: "Choose the problem and solution direction",
    description:
      "Clarify the target user, review the problem statement, and choose one feasible direction.",
    phase: "idea_selection",
    priority: "high",
    weight: 14,
    dependencies: ["confirm-rules"],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "A target user and important need are identified.",
      "The chosen direction has a clear reason to exist.",
    ],
    expectedArtifact: "Selected problem and idea",
    verificationMethod:
      "Check the idea against the requirements and available team skills.",
    riskIfSkipped: "Implementation can start without a clear judging fit.",
    mandatory: false,
  },
  {
    taskKey: "spec-and-architecture",
    title: "Define the product scope and architecture",
    description:
      "Write the primary user journey, acceptance criteria, technical boundaries, and implementation order.",
    phase: "architecture",
    priority: "high",
    weight: 12,
    dependencies: ["choose-problem"],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "The smallest complete feature set is explicit.",
      "High-risk integrations or unknowns are called out before implementation.",
    ],
    expectedArtifact: "Short product and architecture notes",
    verificationMethod: "Review scope against the time available.",
    riskIfSkipped: "Unplanned dependencies may consume the build buffer.",
    mandatory: false,
  },
  {
    taskKey: "implement-mvp",
    title: "Build the smallest complete product",
    description:
      "Implement the main workflow first; defer features that do not improve the core demo.",
    phase: "implementation",
    priority: "critical",
    weight: 38,
    dependencies: ["spec-and-architecture"],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "The main user journey works with persisted, real behavior.",
      "The product is not dependent on fabricated integrations or results.",
    ],
    expectedArtifact: "Working MVP",
    verificationMethod:
      "Run the app and complete the primary workflow with real data.",
    riskIfSkipped: "The entry may have a concept but no working product.",
    mandatory: false,
  },
  {
    taskKey: "test-and-review",
    title: "Test the main journey and review basic security",
    description:
      "Exercise the core flow, check failure states, and review access to private project data.",
    phase: "testing",
    priority: "high",
    weight: 13,
    dependencies: ["implement-mvp"],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "The primary journey has been executed in the running app.",
      "Private data access and obvious failure states have been checked.",
    ],
    expectedArtifact: "Recorded verification notes",
    verificationMethod: "Run checks and record their actual outcome.",
    riskIfSkipped: "A demo-critical failure or data exposure may go unnoticed.",
    mandatory: false,
  },
  {
    taskKey: "deploy-and-demo",
    title: "Verify deployment and rehearse the demo",
    description:
      "Deploy the product, check the published URL, and rehearse the short demo with a backup path.",
    phase: "demo",
    priority: "high",
    weight: 8,
    dependencies: ["test-and-review"],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "The published application is reachable and the core path works.",
      "The demo has a repeatable beginning, payoff, and finish.",
    ],
    expectedArtifact: "Verified deployment and demo outline",
    verificationMethod: "Open the published URL and rehearse from a clean start.",
    riskIfSkipped: "A local-only success may fail during judging.",
    mandatory: false,
  },
];

const fullTemplates: TaskTemplate[] = [
  {
    taskKey: "confirm-rules",
    title: "Confirm official requirements and hard deadlines",
    description:
      "Review official sources and record eligibility, technology restrictions, judging criteria, and deliverables.",
    phase: "intake",
    priority: "critical",
    weight: 6,
    dependencies: [],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "Official competition and rules sources are recorded.",
      "Known restrictions, judging criteria, and deliverables are listed.",
    ],
    expectedArtifact: "Confirmed competition requirements",
    verificationMethod: "Compare each item with the official source.",
    riskIfSkipped: "A missed rule can invalidate a project at submission.",
    mandatory: false,
  },
  {
    taskKey: "understand-problem",
    title: "Define the user problem and judging fit",
    description:
      "Identify the target user, unmet need, and the judging criterion the product will address.",
    phase: "problem",
    priority: "high",
    weight: 7,
    dependencies: ["confirm-rules"],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "The intended user and problem are stated clearly.",
      "The fit with the competition requirements is explainable.",
    ],
    expectedArtifact: "Problem and judging-fit statement",
    verificationMethod: "Check against the official problem statement.",
    riskIfSkipped: "The product may solve an unrelated problem.",
    mandatory: false,
  },
  {
    taskKey: "research-solutions",
    title: "Research existing solutions and evidence",
    description:
      "Gather source-backed findings and note what remains uncertain before choosing a direction.",
    phase: "research",
    priority: "high",
    weight: 10,
    dependencies: ["understand-problem"],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "Important claims are tied to sources where possible.",
      "Facts, inferences, hypotheses, and unknowns are distinguished.",
    ],
    expectedArtifact: "Evidence and open-question notes",
    verificationMethod: "Open each cited source and check its relevance.",
    riskIfSkipped: "Differentiation claims may be unsupported.",
    mandatory: false,
  },
  {
    taskKey: "choose-track",
    title: "Confirm the track and its constraints",
    description:
      "Confirm the assigned track or compare feasible tracks using the recorded criteria.",
    phase: "track_selection",
    priority: "high",
    weight: 5,
    dependencies: ["research-solutions"],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "The track is recorded or the selection question is explicit.",
      "The direction remains feasible within the rules and remaining time.",
    ],
    expectedArtifact: "Track decision and rationale",
    verificationMethod: "Compare track requirements with the selected idea.",
    riskIfSkipped: "Work may not qualify for the intended track.",
    mandatory: false,
  },
  {
    taskKey: "red-team-idea",
    title: "Select and challenge one idea",
    description:
      "Choose one feasible idea, identify its weakest assumption, and define how to test that assumption.",
    phase: "idea_selection",
    priority: "high",
    weight: 8,
    dependencies: ["choose-track"],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "The selected idea has a stated user benefit and differentiator.",
      "At least one major risk has a mitigation or validation step.",
    ],
    expectedArtifact: "Chosen idea and risk note",
    verificationMethod: "Review the idea against judging fit, effort, and evidence.",
    riskIfSkipped: "The team may commit to an untested assumption.",
    mandatory: false,
  },
  {
    taskKey: "specify-architecture",
    title: "Write the product specification and architecture",
    description:
      "Define the core flow, acceptance criteria, architecture boundaries, and implementation tasks.",
    phase: "architecture",
    priority: "high",
    weight: 8,
    dependencies: ["red-team-idea"],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "The minimum complete feature set is written down.",
      "High-risk technical dependencies have a fallback.",
    ],
    expectedArtifact: "Product and architecture specification",
    verificationMethod: "Review the specification against available time and skills.",
    riskIfSkipped: "Technical decisions may arrive too late to recover.",
    mandatory: false,
  },
  {
    taskKey: "build-product",
    title: "Implement the core product",
    description:
      "Build the highest-value complete user journey before optional features.",
    phase: "implementation",
    priority: "critical",
    weight: 30,
    dependencies: ["specify-architecture"],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "The core user journey runs end to end.",
      "The main output is backed by real application behavior.",
    ],
    expectedArtifact: "Working product",
    verificationMethod: "Run the product and complete the primary user journey.",
    riskIfSkipped: "There may be nothing reliable to demonstrate.",
    mandatory: false,
  },
  {
    taskKey: "test-product",
    title: "Run real application checks",
    description:
      "Execute the main journey, record actual check results, and fix demo-blocking failures.",
    phase: "testing",
    priority: "critical",
    weight: 8,
    dependencies: ["build-product"],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "Checks have been executed rather than inferred from code.",
      "Failures and limitations remain visible until fixed.",
    ],
    expectedArtifact: "Executed verification results",
    verificationMethod: "Run the application and the available test/check commands.",
    riskIfSkipped: "A visible failure may interrupt judging.",
    mandatory: false,
  },
  {
    taskKey: "review-security",
    title: "Review security and failure recovery",
    description:
      "Check private data access, untrusted inputs, failure states, and any consequential action approvals.",
    phase: "security",
    priority: "high",
    weight: 5,
    dependencies: ["test-product"],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "Private operations enforce server-side ownership checks.",
      "Known risks and unresolved findings are recorded.",
    ],
    expectedArtifact: "Security review notes",
    verificationMethod: "Attempt unauthorized access and inspect risky flows.",
    riskIfSkipped: "Private data or the demo may be exposed to preventable failures.",
    mandatory: false,
  },
  {
    taskKey: "deploy-product",
    title: "Deploy and verify the published product",
    description:
      "Publish the app and verify the real production URL separately from local behavior.",
    phase: "deployment",
    priority: "high",
    weight: 5,
    dependencies: ["review-security"],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "The published URL responds.",
      "The main user journey has been checked in production.",
    ],
    expectedArtifact: "Verified production URL",
    verificationMethod: "Open the published URL and complete the core journey.",
    riskIfSkipped: "Local success may not translate to a working judge-facing app.",
    mandatory: false,
  },
  {
    taskKey: "prepare-demo",
    title: "Prepare and rehearse the demo and pitch",
    description:
      "Plan a concise demonstration, practice the handoffs, and prepare a fallback if live services fail.",
    phase: "demo",
    priority: "high",
    weight: 5,
    dependencies: ["deploy-product"],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "The demo shows the problem, working product, and outcome.",
      "A backup path exists for external-service failures.",
    ],
    expectedArtifact: "Rehearsed demo outline",
    verificationMethod: "Rehearse once from a clean starting state.",
    riskIfSkipped: "The value of the product may not be clear to judges.",
    mandatory: false,
  },
];

function taskTemplates(availableMinutes: number, complexity: number): TaskTemplate[] {
  let selected: TaskTemplate[];

  if (availableMinutes < 3) {
    selected = [
      {
        taskKey: "deadline-critical-check",
        title: "Protect required deliverables and record the next action",
        description:
          "Time is too short for a complete hackathon plan. Preserve mandatory requirements and identify the highest-value immediate action.",
        phase: "submission",
        priority: "critical",
        weight: 100,
        dependencies: [],
        owner: null,
        status: "todo",
        acceptanceCriteria: [
          "Recorded mandatory deliverables remain visible.",
          "The next action is explicit and does not imply unperformed work.",
        ],
        expectedArtifact: "Deadline-critical action",
        verificationMethod:
          "Compare the immediate action and deliverables with the official rules.",
        riskIfSkipped:
          "The remaining time is not enough to complete normal project phases.",
        mandatory: true,
      },
    ];
  } else if (availableMinutes <= 30) {
    selected = shortTemplates;
  } else if (availableMinutes <= 180) {
    selected = mediumTemplates;
  } else if (availableMinutes <= 360) {
    selected = fullTemplates.filter((task) =>
      [
        "confirm-rules",
        "understand-problem",
        "research-solutions",
        "choose-track",
        "red-team-idea",
        "specify-architecture",
        "build-product",
        "test-product",
        "deploy-product",
        "prepare-demo",
      ].includes(task.taskKey),
    );
  } else {
    selected = fullTemplates;
  }

  if (availableMinutes < 3) {
    return selected;
  }

  const submissionAudit: TaskTemplate = {
    taskKey: "submission-audit",
    title: "Audit every required submission item",
    description:
      "Compare recorded deliverables with the official instructions and confirm where each item will be submitted.",
    phase: "submission",
    priority: "critical",
    weight: availableMinutes <= 30 ? 10 : 5,
    dependencies: selected.length > 0 ? [selected[selected.length - 1]!.taskKey] : [],
    owner: null,
    status: "todo",
    acceptanceCriteria: [
      "The submission method and deadline have been checked.",
      "Each recorded mandatory deliverable has a verified location.",
      "No submission confirmation is assumed without evidence.",
    ],
    expectedArtifact: "Completed submission checklist",
    verificationMethod:
      "Compare against official rules and inspect the final submission state.",
    riskIfSkipped: "A complete product may still have an incomplete submission.",
    mandatory: true,
  };

  const complexityAdjusted = selected.map((task) => {
    if (task.taskKey === "build-product") {
      return { ...task, weight: task.weight + (complexity - 3) * 2 };
    }
    if (task.taskKey === "research-solutions") {
      return { ...task, weight: task.weight + Math.max(0, complexity - 3) };
    }
    return task;
  });

  return [...complexityAdjusted, submissionAudit];
}

function allocateMinutes(templates: TaskTemplate[], totalMinutes: number): number[] {
  const totalWeight = templates.reduce((sum, task) => sum + task.weight, 0);
  const allocations = templates.map((task) =>
    Math.floor((totalMinutes * task.weight) / totalWeight),
  );
  let remaining = totalMinutes - allocations.reduce((sum, value) => sum + value, 0);

  for (let i = 0; remaining > 0; i = (i + 1) % allocations.length) {
    allocations[i] = allocations[i]! + 1;
    remaining -= 1;
  }

  return allocations;
}

export function createPlanDraft({
  competition,
  now,
  availableMinutes,
  previousTasks,
}: {
  competition: Competition;
  now: Date;
  availableMinutes: number;
  previousTasks: WorkflowTaskRecord[];
}): PlanDraft {
  const warnings: string[] = [];
  const remainingDeadlineMinutes = Math.floor(
    (competition.deadline.getTime() - now.getTime()) / 60_000,
  );
  const boundedMinutes = Math.max(
    1,
    Math.min(availableMinutes, remainingDeadlineMinutes),
  );
  const templates = taskTemplates(boundedMinutes, competition.ideaComplexity);
  const requiredDeliverableCriteria = competition.mandatoryDeliverables.map(
    (deliverable) =>
      `Confirm this requirement against the official rules: ${deliverable}`,
  );
  const templatesWithDeliverables = templates.map((template) =>
    template.taskKey === "submission-audit" ||
    template.taskKey === "deadline-critical-check"
      ? {
          ...template,
          acceptanceCriteria: [
            ...template.acceptanceCriteria,
            ...requiredDeliverableCriteria,
          ],
        }
      : template,
  );
  const workMinutes = Math.max(
    templatesWithDeliverables.length,
    Math.floor(boundedMinutes * 0.8),
  );
  const bufferMinutes = Math.max(0, boundedMinutes - workMinutes);
  const allocations = allocateMinutes(templatesWithDeliverables, workMinutes);
  const previousStatusByKey = new Map(
    previousTasks.map((task) => [task.taskKey, task.status as TaskStatus]),
  );
  let nextStart = new Date(now);

  const tasks = templatesWithDeliverables.map(
    (template, index): ScheduledTask => {
    const duration = allocations[index]!;
    const plannedStartAt = new Date(nextStart);
    const plannedEndAt = new Date(plannedStartAt.getTime() + duration * 60_000);
    nextStart = plannedEndAt;

    return {
      ...template,
      status: previousStatusByKey.get(template.taskKey) ?? template.status,
      estimatedMinutes: duration,
      plannedStartAt,
      plannedEndAt,
    };
    },
  );

  if (!competition.officialUrl && !competition.rulesUrl) {
    warnings.push(
      "No official competition or rules URL is recorded; verify rules and submission details manually.",
    );
  }
  if (competition.mandatoryDeliverables.length === 0) {
    warnings.push(
      "No mandatory deliverables are recorded; review official submission requirements.",
    );
  }
  if (boundedMinutes < 120) {
    warnings.push(
      "Less than two hours remain; this compressed schedule is at risk.",
    );
  }
  if (competition.ideaComplexity >= 4) {
    warnings.push(
      "The selected idea complexity is high; reduce scope if implementation slips.",
    );
  }
  if (tasks.some((task) => task.status === "blocked")) {
    warnings.push(
      "A task remains blocked; resolve the blocker before treating the plan as on track.",
    );
  }
  if (competition.teamSize > 1 && competition.teamSkills.length === 0) {
    warnings.push(
      "Team skills are not recorded; task ownership and estimates may need adjustment.",
    );
  }

  const infeasible =
    boundedMinutes < 15 ||
    boundedMinutes < templatesWithDeliverables.length ||
    tasks.some((task) => task.plannedEndAt > competition.deadline);
  if (infeasible) {
    warnings.push(
      "The deadline cannot fit the current minimum task sequence; preserve required deliverables and reduce scope.",
    );
  }

  return {
    status: infeasible ? "infeasible" : warnings.length > 0 ? "at_risk" : "feasible",
    warnings,
    bufferMinutes,
    tasks,
  };
}

export function serializeTask(
  task: WorkflowTaskRecord | ScheduledTask,
  planId: string,
): Record<string, unknown> {
  return {
    id: "id" in task && typeof task.id === "string" ? task.id : undefined,
    planId,
    taskKey: task.taskKey,
    title: task.title,
    description: task.description,
    phase: task.phase,
    priority: task.priority,
    estimatedMinutes: task.estimatedMinutes,
    plannedStartAt: task.plannedStartAt.toISOString(),
    plannedEndAt: task.plannedEndAt.toISOString(),
    dependencies: task.dependencies,
    owner: task.owner,
    status: task.status,
    acceptanceCriteria: task.acceptanceCriteria,
    expectedArtifact: task.expectedArtifact,
    verificationMethod: task.verificationMethod,
    riskIfSkipped: task.riskIfSkipped,
    mandatory: task.mandatory,
  };
}
