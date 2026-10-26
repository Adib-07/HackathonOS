import { useMemo } from "react";
import { Link, useRoute } from "wouter";
import {
  getGetPlanQueryKey,
  useGetCompetition,
  useGetPlan,
  useListPlanVersions,
} from "@workspace/api-client-react";
import type { PlanTask } from "@workspace/api-client-react";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Check,
  CircleDashed,
  CircleDot,
  CircleHelp,
  Clock3,
  Info,
  Lock,
  ShieldCheck,
} from "lucide-react";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeading,
  Panel,
  StatusPill,
} from "@/components/workspace";
import {
  buildStageSummaries,
  computeRemaining,
  formatDuration,
  phaseLabel,
  summarisePlan,
  STAGE_STATE_LABELS,
  type StageSummary,
  type StageTask,
} from "@/lib/workflow";

/**
 * The generated PlanTask has Date fields; the workflow helpers accept both
 * Date and string so the same code works before and after JSON parsing.
 */
function toStageTasks(tasks: PlanTask[] | undefined): StageTask[] {
  return (tasks ?? []).map((task) => ({
    ...(task as unknown as StageTask),
    verified: task.verification?.verified === true,
  }));
}

export default function WorkflowPage() {
  const [, params] = useRoute("/competitions/:id/workflow");
  const competitionId = params?.id ?? "";

  const competitionQuery = useGetCompetition(competitionId);
  const versionsQuery = useListPlanVersions(competitionId);

  const versions = versionsQuery.data ?? [];
  const latestVersionId = versions[0]?.id ?? "";
  const planId = latestVersionId;

  const planQuery = useGetPlan(competitionId, planId, {
    query: {
      enabled: !!planId,
      queryKey: getGetPlanQueryKey(competitionId, planId),
    },
  });

  const competition = competitionQuery.data;
  const plan = planQuery.data;

  const stageTasks = useMemo(() => toStageTasks(plan?.tasks), [plan?.tasks]);
  const stages = useMemo(
    () => buildStageSummaries(stageTasks, competition?.deadline),
    [stageTasks, competition?.deadline],
  );
  const progress = useMemo(() => summarisePlan(stageTasks), [stageTasks]);
  const remaining = useMemo(
    () =>
      competition
        ? computeRemaining(competition.deadline)
        : null,
    [competition],
  );

  const blockedStages = stages.filter((stage) => stage.state === "blocked");
  const verifiedStages = stages.filter((stage) => stage.state === "verified");
  const activeStages = stages.filter(
    (stage) => stage.state === "active" || stage.state === "complete",
  );
  const scheduledStages = stages.filter((stage) => stage.state === "scheduled");
  const upcomingStages = stages.filter((stage) => stage.state === "not_started");

  if (competitionQuery.isLoading || versionsQuery.isLoading) {
    return <LoadingBlock label="Loading workflow" />;
  }
  if (competitionQuery.isError || !competition) {
    return (
      <ErrorState
        title="Competition workspace unavailable"
        retry={() => competitionQuery.refetch()}
      />
    );
  }
  if (versionsQuery.isError) {
    return (
      <ErrorState
        title="Saved plan versions unavailable"
        retry={() => versionsQuery.refetch()}
      />
    );
  }

  const hasPlan = stageTasks.length > 0;

  return (
    <div className="reveal">
      <Link
        href={`/competitions/${competitionId}`}
        className="back-link"
        data-testid="link-back-details"
      >
        <ArrowLeft size={14} /> {competition.name}
      </Link>

      <PageHeading
        eyebrow="HACKATHON LIFECYCLE"
        title="Workflow"
        detail="Every stage below is derived from the plan saved for this competition. Stages without a saved plan are shown as not started, never as done."
        action={
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {plan && <StatusPill value={plan.status} />}
            <Link
              href={`/competitions/${competitionId}/planner`}
              className="button button-secondary"
              data-testid="link-workflow-planner"
            >
              Open planner <ArrowRight size={14} />
            </Link>
          </div>
        }
      />

      <div className="workflow-summary">
        <Panel className="workflow-summary-panel">
          <div className="workflow-summary-grid">
            <div className="workflow-stat">
              <span className="workflow-stat-label">TIME REMAINING</span>
              <strong
                className={
                  remaining?.isPast
                    ? "workflow-stat-value workflow-value-danger"
                    : remaining?.isCritical
                      ? "workflow-stat-value workflow-value-warning"
                      : "workflow-stat-value"
                }
                data-testid="workflow-time-remaining"
              >
                {remaining ? (remaining.isPast ? "Overdue" : remaining.label) : "—"}
              </strong>
              <small>
                {remaining
                  ? remaining.isPast
                    ? "The submission deadline has passed"
                    : `Until ${new Date(competition.deadline).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
                  : "Deadline unavailable"}
              </small>
            </div>
            <div className="workflow-stat">
              <span className="workflow-stat-label">PLAN PROGRESS</span>
              <strong className="workflow-stat-value" data-testid="workflow-progress">
                {progress.total === 0 ? "No plan" : `${progress.done}/${progress.total}`}
              </strong>
              <small>
                {progress.total === 0
                  ? "Generate a plan to track stage progress"
                  : `${progress.completion}% of saved tasks complete`}
              </small>
            </div>
            <div className="workflow-stat">
              <span className="workflow-stat-label">OPEN TASK ESTIMATE</span>
              <strong className="workflow-stat-value" data-testid="workflow-effort">
                {formatDuration(progress.remainingMinutes)}
              </strong>
              <small>
                {progress.blocked > 0
                  ? `${progress.blocked} blocked task${progress.blocked === 1 ? "" : "s"}`
                  : "Sum of estimates on open tasks"}
              </small>
            </div>
            <div className="workflow-stat">
              <span className="workflow-stat-label">BLOCKED STAGES</span>
              <strong
                className={
                  blockedStages.length > 0
                    ? "workflow-stat-value workflow-value-danger"
                    : "workflow-stat-value"
                }
                data-testid="workflow-blocked-count"
              >
                {blockedStages.length}
              </strong>
              <small>
                {blockedStages.length > 0
                  ? blockedStages.map((stage) => stage.definition.label).join(", ")
                  : "Nothing is blocked"}
              </small>
            </div>
          </div>
          {plan && plan.warnings.length > 0 && (
            <div className="plan-warning-banner" role="note">
              <ShieldCheck size={15} />
              <div>
                <strong>Plan warnings</strong>
                <span>{plan.warnings.join(" ")}</span>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {!hasPlan ? (
        <Panel className="workflow-empty">
          <EmptyState
            icon={<CircleDashed size={23} />}
            title="No saved plan for this competition"
            detail="Generate a plan from the competition deadline. The stages below will then reflect real saved tasks and their status."
            action={
              <Link
                href={`/competitions/${competitionId}/planner`}
                className="button button-primary"
                data-testid="link-generate-plan-from-workflow"
              >
                Generate a plan <ArrowRight size={14} />
              </Link>
            }
          />
          <StageList stages={stages} competitionId={competitionId} />
        </Panel>
      ) : (
        <>
          {activeStages.length > 0 ? (
            <section className="workflow-section" aria-labelledby="workflow-active-heading">
              <div className="workflow-section-head">
                <h2 id="workflow-active-heading">In progress and complete</h2>
                <span>{activeStages.length} stages</span>
              </div>
              <StageList stages={activeStages} competitionId={competitionId} />
            </section>
          ) : (
            <p className="workflow-section-empty">
              No stage has work in progress. Start a task in the planner to move
              a stage forward.
            </p>
          )}

          {verifiedStages.length > 0 && (
            <section className="workflow-section" aria-labelledby="workflow-verified-heading">
              <div className="workflow-section-head">
                <h2 id="workflow-verified-heading">Verified</h2>
                <span>{verifiedStages.length} stages</span>
              </div>
              <StageList stages={verifiedStages} competitionId={competitionId} />
            </section>
          )}

          {blockedStages.length > 0 && (
            <section className="workflow-section" aria-labelledby="workflow-blocked-heading">
              <div className="workflow-section-head">
                <h2 id="workflow-blocked-heading">Blocked</h2>
                <span>{blockedStages.length} stages</span>
              </div>
              <StageList stages={blockedStages} competitionId={competitionId} />
            </section>
          )}

          {scheduledStages.length > 0 && (
            <section className="workflow-section" aria-labelledby="workflow-scheduled-heading">
              <div className="workflow-section-head">
                <h2 id="workflow-scheduled-heading">Scheduled</h2>
                <span>{scheduledStages.length} stages</span>
              </div>
              <StageList stages={scheduledStages} competitionId={competitionId} />
            </section>
          )}

          {upcomingStages.length > 0 && (
            <section className="workflow-section" aria-labelledby="workflow-upcoming-heading">
              <div className="workflow-section-head">
                <h2 id="workflow-upcoming-heading">Not started</h2>
                <span>{upcomingStages.length} stages</span>
              </div>
              <StageList stages={upcomingStages} competitionId={competitionId} />
            </section>
          )}
        </>
      )}

      <div className="planned-note">
        <ShieldCheck size={15} />
        <span>
          Stage status reflects saved task records only. It is not evidence that
          a build, test, security review, deployment, or submission passed.
        </span>
      </div>
    </div>
  );
}

function StageList({
  stages,
  competitionId,
}: {
  stages: StageSummary[];
  competitionId: string;
}) {
  if (stages.length === 0) return null;
  return (
    <div className="stage-list">
      {stages.map((stage) => (
        <StageRow stage={stage} competitionId={competitionId} key={stage.definition.id} />
      ))}
    </div>
  );
}

function StageRow({
  stage,
  competitionId,
}: {
  stage: StageSummary;
  competitionId: string;
}) {
  const { definition } = stage;

  if (definition.planned) {
    const tooltipText = `${definition.label}: not backed by a saved plan. Unlocks when a plan includes tasks for this stage.`;
    return (
      <article
        className="stage-row stage-planned"
        data-testid={`stage-${definition.id}`}
        aria-label={tooltipText}
      >
        <span className="stage-state-icon stage-icon-planned">
          <Lock size={14} />
          <span className="stage-lock-tooltip">
            <Info size={10} />
            <span className="tooltip-text">Unlocks when a plan includes {definition.label.toLowerCase()} tasks</span>
          </span>
        </span>
        <div className="stage-row-main">
          <div className="stage-row-head">
            <h3>{definition.label}</h3>
            <span className="stage-state-label stage-label-planned">
              {STAGE_STATE_LABELS.planned}
            </span>
          </div>
          <p>{definition.summary}</p>
        </div>
      </article>
    );
  }

  // Special handling for retrospective stage when locked (not unlocked yet)
  if (definition.id === "retrospective" && stage.state === "planned") {
    const tooltipText = `${definition.label}: unlocks when Submission stage is complete or the competition deadline has passed.`;
    return (
      <article
        className="stage-row stage-planned"
        data-testid={`stage-${definition.id}`}
        aria-label={tooltipText}
      >
        <span className="stage-state-icon stage-icon-planned">
          <Lock size={14} />
          <span className="stage-lock-tooltip">
            <Info size={10} />
            <span className="tooltip-text">Unlocks when Submission is complete or the deadline has passed</span>
          </span>
        </span>
        <div className="stage-row-main">
          <div className="stage-row-head">
            <h3>{definition.label}</h3>
            <span className="stage-state-label stage-label-planned">
              {STAGE_STATE_LABELS.planned}
            </span>
          </div>
          <p>{definition.summary}</p>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`stage-row stage-${stage.state}`}
      data-testid={`stage-${definition.id}`}
      data-stage-state={stage.state}
    >
      <span className="stage-state-icon">
        {stage.state === "complete" || stage.state === "verified" ? (
          <Check size={14} />
        ) : stage.state === "blocked" ? (
          <Ban size={14} />
        ) : stage.state === "active" ? (
          <CircleDot size={14} />
        ) : stage.state === "scheduled" ? (
          <Clock3 size={14} />
        ) : (
          <CircleDashed size={14} />
        )}
      </span>
      <div className="stage-row-main">
        <div className="stage-row-head">
          <h3>{definition.label}</h3>
          <span className={`stage-state-label stage-label-${stage.state}`}>
            {STAGE_STATE_LABELS[stage.state]}
          </span>
        </div>
        <p>{definition.summary}</p>
        {stage.total > 0 && (
          <div className="stage-meta">
            <span>
              {stage.done} of {stage.total} task{stage.total === 1 ? "" : "s"} done
            </span>
            {stage.verified > 0 && (
              <span className="stage-meta-verified">
                {stage.verified} verified
              </span>
            )}
            <span>
              <Clock3 size={12} /> {formatDuration(stage.estimatedMinutes)} estimated
            </span>
            {stage.blocked > 0 && (
              <span className="stage-meta-blocked">
                {stage.blocked} blocked
              </span>
            )}
          </div>
        )}
        {stage.nextTask && (
          <div className="stage-next">
            <span className="stage-next-label">NEXT</span>
            <span className="stage-next-title">{stage.nextTask.title}</span>
            <span className="stage-next-phase mono">
              {phaseLabel(stage.nextTask.phase)}
            </span>
            <Link
              href={`/competitions/${competitionId}/planner`}
              className="stage-next-link"
              data-testid={`stage-next-${definition.id}`}
            >
              Open in planner <ArrowRight size={12} />
            </Link>
          </div>
        )}
        {stage.blockers.length > 0 && (
          <ul className="stage-blockers">
            {stage.blockers.map((blocker) => (
              <li key={blocker.id}>{blocker.title}</li>
            ))}
          </ul>
        )}
        {stage.total === 0 && (
          <div className="stage-next stage-next-empty">
            <span className="stage-next-label">NOT STARTED</span>
            <span className="stage-next-title">
              No saved task for this stage in the current plan.
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
