/**
 * Verification rules.
 *
 * HackathonOS distinguishes five task states:
 *
 *   NOT_STARTED  the task has not been begun
 *   IN_PROGRESS  the task is being worked on
 *   BLOCKED      the task cannot proceed
 *   DONE         the owner says the work is finished - but there is no proof
 *   VERIFIED     the work is finished AND evidence satisfies the task's
 *                own verification requirement
 *
 * DONE is never treated as VERIFIED. A task only becomes VERIFIED when
 * explicit evidence exists, that evidence matches the requirement recorded for
 * the task, and nothing contradicts it.
 *
 * This module is deliberately free of I/O so the rules can be unit tested
 * directly and reused by the API, the workflow view, and the task list.
 */

export const EVIDENCE_TYPES = [
  "TEST_RESULT",
  "BUILD_RESULT",
  "DEPLOYMENT_URL",
  "HTTP_CHECK",
  "MANUAL_REVIEW",
  "SUBMISSION_CONFIRMATION",
] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const EVIDENCE_RESULTS = ["passed", "failed"] as const;

export type EvidenceResult = (typeof EVIDENCE_RESULTS)[number];

/**
 * Where the evidence came from. Only "manual" exists today: the API refuses
 * client-supplied machine provenance because nothing in this codebase runs
 * checks on a user's behalf.
 */
export const EVIDENCE_SOURCES = ["manual"] as const;

export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

export const TASK_VERIFICATION_STATES = [
  "not_started",
  "in_progress",
  "blocked",
  "done",
  "verified",
] as const;

export type TaskVerificationState = (typeof TASK_VERIFICATION_STATES)[number];

/** The raw workflow status persisted on a task row. */
export const TASK_STATUSES = [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "deferred",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Minimal evidence shape the rules operate on. */
export interface VerifiableEvidence {
  id: string;
  /** Stable task identity the evidence belongs to. */
  taskKey: string;
  type: EvidenceType;
  result: EvidenceResult;
  /** When the check was observed. */
  observedAt: Date | string;
  /** The verification method the task required when this evidence was recorded. */
  verificationMethodSnapshot: string;
  source: EvidenceSource;
}

/** Minimal task shape the rules operate on. */
export interface VerifiableTask {
  id: string;
  taskKey: string;
  phase: string;
  status: TaskStatus;
  /** The task's stated verification method, e.g. "Run the application ...". */
  verificationMethod: string;
}

/**
 * Which evidence types can satisfy a task, keyed by the task's phase.
 *
 * A phase may require more than one type when a single piece of evidence is
 * not sufficient on its own. For example a deployment task needs both a
 * deployment URL and an HTTP check - a URL alone does not prove the
 * application works.
 */
export const PHASE_REQUIRED_EVIDENCE: Record<string, EvidenceType[]> = {
  intake: ["MANUAL_REVIEW"],
  problem: ["MANUAL_REVIEW"],
  research: ["MANUAL_REVIEW"],
  track_selection: ["MANUAL_REVIEW"],
  idea_selection: ["MANUAL_REVIEW"],
  specification: ["MANUAL_REVIEW"],
  architecture: ["MANUAL_REVIEW"],
  implementation: ["BUILD_RESULT", "TEST_RESULT"],
  testing: ["TEST_RESULT"],
  security: ["MANUAL_REVIEW"],
  deployment: ["DEPLOYMENT_URL", "HTTP_CHECK"],
  demo: ["MANUAL_REVIEW"],
  pitch: ["MANUAL_REVIEW"],
  submission: ["SUBMISSION_CONFIRMATION"],
};

/**
 * Fallback requirement for a phase with no explicit mapping. A task must
 * never be verifiable by default just because its phase is unknown.
 */
export const DEFAULT_REQUIRED_EVIDENCE: EvidenceType[] = ["MANUAL_REVIEW"];

export function requiredEvidenceTypes(phase: string): EvidenceType[] {
  return PHASE_REQUIRED_EVIDENCE[phase] ?? DEFAULT_REQUIRED_EVIDENCE;
}

function toTime(value: Date | string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export interface EvidenceAssessment {
  /** True when this evidence can support verification. */
  supporting: boolean;
  /** True when a newer evidence of the same type supersedes this record. */
  superseded: boolean;
  /** True when the task's verification requirement changed after this record. */
  stale: boolean;
  /** Human readable explanation of the state, shown in the UI. */
  reason: string;
}

export interface TaskVerification {
  state: TaskVerificationState;
  /** True only when the state is "verified". */
  verified: boolean;
  /** Evidence types this task needs in order to be verified. */
  requiredTypes: EvidenceType[];
  /** Required types that have a passing, current, matching record. */
  satisfiedTypes: EvidenceType[];
  /** Required types that have no usable record yet. */
  missingTypes: EvidenceType[];
  /** Required types whose most recent matching record failed. */
  failedTypes: EvidenceType[];
  /** Number of evidence records considered for this task. */
  evidenceCount: number;
  /** The most recent passing record per satisfied type, if any. */
  supportingEvidenceIds: string[];
  /** Records that exist but cannot support verification. */
  unusableEvidenceIds: string[];
  /** True when a required type has a failed most-recent record. */
  blockedByFailure: boolean;
  /** True when at least one record is stale because the requirement changed. */
  hasStaleEvidence: boolean;
  /** Explains why the task is not verified. */
  reason: string;
}

/**
 * Classify a single evidence record against the task that owns it.
 *
 * A record is *stale* when the task's verification requirement has changed
 * since the record was made, because the record then answers a different
 * question than the one the task now asks. A record is *superseded* when a
 * newer record of the same type exists, because the newer observation is the
 * current truth for that type.
 */
export function assessEvidence(
  task: VerifiableTask,
  evidence: VerifiableEvidence,
  allEvidence: VerifiableEvidence[],
): EvidenceAssessment {
  const isStale =
    evidence.verificationMethodSnapshot.trim() !==
    task.verificationMethod.trim();

  const newerOfSameType = allEvidence.some(
    (other) =>
      other.id !== evidence.id &&
      other.type === evidence.type &&
      toTime(other.observedAt) > toTime(evidence.observedAt),
  );

  if (isStale) {
    return {
      supporting: false,
      superseded: newerOfSameType,
      stale: true,
      reason:
        "The task's verification requirement changed after this was recorded, so it no longer answers the right question.",
    };
  }

  if (newerOfSameType) {
    return {
      supporting: false,
      superseded: true,
      stale: false,
      reason: "A newer record of this type exists, so this one is no longer current.",
    };
  }

  if (evidence.result === "failed") {
    return {
      supporting: false,
      superseded: false,
      stale: false,
      reason: "This check failed, so it cannot support verification.",
    };
  }

  return {
    supporting: true,
    superseded: false,
    stale: false,
    reason: "This record satisfies one of the task's verification requirements.",
  };
}

/**
 * Evaluate a task's verification state from its status and its evidence.
 *
 * The rules, in order:
 *   1. A blocked task is BLOCKED. No evidence can lift that.
 *   2. A task that is not done is IN_PROGRESS or NOT_STARTED. Evidence alone
 *      does not make unfinished work verified.
 *   3. A done task without satisfying evidence is DONE, not VERIFIED.
 *   4. A done task becomes VERIFIED only when every required evidence type
 *      has a passing, current, non-stale record.
 *   5. A failed required record blocks verification even if another record of
 *      the same type passed, unless the failure has been superseded by a newer
 *      passing record.
 */
export function evaluateTaskVerification(
  task: VerifiableTask,
  evidence: VerifiableEvidence[],
): TaskVerification {
  const requiredTypes = requiredEvidenceTypes(task.phase);
  const taskEvidence = evidence.filter(
    (item) => item.taskKey === task.taskKey,
  );

  const assessments = new Map(
    taskEvidence.map((item) => [
      item.id,
      assessEvidence(task, item, taskEvidence),
    ]),
  );

  const satisfiedTypes: EvidenceType[] = [];
  const missingTypes: EvidenceType[] = [];
  const failedTypes: EvidenceType[] = [];
  const supportingEvidenceIds: string[] = [];
  const unusableEvidenceIds: string[] = [];

  for (const type of requiredTypes) {
    const ofType = taskEvidence.filter((item) => item.type === type);
    const usable = ofType.filter((item) => assessments.get(item.id)?.supporting);
    const failed = ofType.filter((item) => {
      const assessment = assessments.get(item.id);
      return (
        assessment &&
        !assessment.supporting &&
        !assessment.stale &&
        !assessment.superseded &&
        item.result === "failed"
      );
    });

    if (usable.length > 0) {
      satisfiedTypes.push(type);
      // Only the most recent passing record is cited as support.
      const latest = [...usable].sort(
        (a, b) => toTime(b.observedAt) - toTime(a.observedAt),
      )[0];
      if (latest) supportingEvidenceIds.push(latest.id);
    } else if (failed.length > 0) {
      failedTypes.push(type);
    } else {
      missingTypes.push(type);
    }
  }

  for (const item of taskEvidence) {
    if (!assessments.get(item.id)?.supporting) {
      unusableEvidenceIds.push(item.id);
    }
  }

  const blockedByFailure = failedTypes.length > 0;
  const hasStaleEvidence = taskEvidence.some(
    (item) => assessments.get(item.id)?.stale,
  );
  const evidenceCount = taskEvidence.length;

  const base: TaskVerification = {
    state: "not_started",
    verified: false,
    requiredTypes,
    satisfiedTypes,
    missingTypes,
    failedTypes,
    evidenceCount,
    supportingEvidenceIds,
    unusableEvidenceIds,
    blockedByFailure,
    hasStaleEvidence,
    reason: "",
  };

  if (task.status === "blocked") {
    return {
      ...base,
      state: "blocked",
      reason: "This task is blocked. Resolve the blocker before verifying it.",
    };
  }

  if (task.status === "todo" || task.status === "deferred") {
    return {
      ...base,
      state: "not_started",
      reason:
        evidenceCount > 0
          ? "Evidence is recorded, but the task has not been marked done yet."
          : "This task has not been started.",
    };
  }

  if (task.status === "in_progress") {
    return {
      ...base,
      state: "in_progress",
      reason:
        evidenceCount > 0
          ? "Evidence is recorded, but the task is still in progress."
          : "This task is in progress.",
    };
  }

  // status === "done"
  if (blockedByFailure) {
    return {
      ...base,
      state: "done",
      reason: `A required check failed (${failedTypes.join(", ")}). Record a passing result, or re-verify after fixing the failure.`,
    };
  }

  if (missingTypes.length > 0) {
    return {
      ...base,
      state: "done",
      reason: `Still needs ${missingTypes.join(", ")} evidence to be verified.`,
    };
  }

  if (satisfiedTypes.length === requiredTypes.length) {
    return {
      ...base,
      state: "verified",
      verified: true,
      reason: "Every required check has a current passing result.",
    };
  }

  return {
    ...base,
    state: "done",
    reason: "This task is complete but not yet verified.",
  };
}

/** Human readable label for a verification state. */
export const VERIFICATION_STATE_LABELS: Record<TaskVerificationState, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  verified: "Verified",
};

/** Human readable label for an evidence type. */
export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  TEST_RESULT: "Test result",
  BUILD_RESULT: "Build result",
  DEPLOYMENT_URL: "Deployment URL",
  HTTP_CHECK: "HTTP check",
  MANUAL_REVIEW: "Manual review",
  SUBMISSION_CONFIRMATION: "Submission confirmation",
};

/**
 * Field requirements for each evidence type. The API enforces the same rules,
 * but keeping them here lets the UI show exactly what a type needs.
 */
export const EVIDENCE_TYPE_RULES: Record<
  EvidenceType,
  {
    /** Which optional field this type requires. */
    requires?: "sourceUrl" | "commandName";
    /** Short instruction shown in the form. */
    hint: string;
  }
> = {
  TEST_RESULT: {
    requires: "commandName",
    hint: "Name the test or command that produced this result.",
  },
  BUILD_RESULT: {
    requires: "commandName",
    hint: "Name the build command that produced this result.",
  },
  DEPLOYMENT_URL: {
    requires: "sourceUrl",
    hint: "The published URL. A URL alone never verifies a deployment on its own.",
  },
  HTTP_CHECK: {
    requires: "sourceUrl",
    hint: "The URL that was checked and what the check returned.",
  },
  MANUAL_REVIEW: {
    hint: "Describe what you reviewed. This is recorded as a manual review.",
  },
  SUBMISSION_CONFIRMATION: {
    requires: "sourceUrl",
    hint: "Where the submission was made, and what was confirmed.",
  },
};
