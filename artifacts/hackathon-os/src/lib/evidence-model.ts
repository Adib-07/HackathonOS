/**
 * Client-side evidence labels and rules.
 *
 * These mirror the server's rules in `artifacts/api-server/src/lib/verification.ts`.
 * The server remains the authority: it decides whether a task is verified and
 * returns that state with every task. This module only supplies display
 * labels and form hints, so the UI never has to re-derive verification.
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

export const VERIFICATION_STATES = [
  "not_started",
  "in_progress",
  "blocked",
  "done",
  "verified",
] as const;

export type VerificationState = (typeof VERIFICATION_STATES)[number];

export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  TEST_RESULT: "Test result",
  BUILD_RESULT: "Build result",
  DEPLOYMENT_URL: "Deployment URL",
  HTTP_CHECK: "HTTP check",
  MANUAL_REVIEW: "Manual review",
  SUBMISSION_CONFIRMATION: "Submission confirmation",
};

export const VERIFICATION_STATE_LABELS: Record<VerificationState, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  verified: "Verified",
};

/**
 * What each evidence type needs, and a short instruction for the form.
 * The API enforces the same requirements.
 */
export const EVIDENCE_TYPE_RULES: Record<
  EvidenceType,
  {
    requires?: "sourceUrl" | "commandName";
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

/**
 * A one-line explanation of the difference between the states, shown in the
 * task card so a user is never left guessing what "Done" means.
 */
export const VERIFICATION_STATE_EXPLANATIONS: Record<
  VerificationState,
  string
> = {
  not_started: "The work has not been started.",
  in_progress: "The work is under way but not finished.",
  blocked: "The work cannot continue until a blocker is resolved.",
  done: "The work is complete, but no evidence proves it yet.",
  verified:
    "The work is complete and the required checks have passing evidence.",
};
