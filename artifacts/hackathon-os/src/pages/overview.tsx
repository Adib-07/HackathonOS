import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useGetOverview,
  useListCompetitions,
  type Competition,
} from "@workspace/api-client-react";
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  CalendarClock,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileCheck2,
  Flag,
  FolderKanban,
  Gauge,
  ListChecks,
  Plus,
  ShieldCheck,
  Sparkles,
  Lock,
  AlertCircle,
} from "lucide-react";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Metric,
  ModuleStatus,
  PageHeading,
  Panel,
  StatusPill,
  Badge,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/workspace";
import { CompetitionModal } from "@/components/CompetitionModal";
import {
  buildStageSummaries,
  computeRemaining,
  formatDuration,
  summarisePlan,
  type StageTask,
  WORKSPACE_GATES,
} from "@/lib/workflow";
import { useWorkspaceGate } from "@/hooks/useWorkspaceGate";

export default function OverviewPage() {
  const query = useGetOverview();
  const competitionsQuery = useListCompetitions();
  const [createOpen, setCreateOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const gate = useWorkspaceGate();

  const overview = query.data;
  const competitions = competitionsQuery.data ?? [];

  const planTasks = useMemo(
    () => (overview?.currentPlan?.tasks ?? []) as unknown as StageTask[],
    [overview?.currentPlan?.tasks],
  );
  const progress = useMemo(() => summarisePlan(planTasks), [planTasks]);
  const stages = useMemo(() => buildStageSummaries(planTasks), [planTasks]);

  if (query.isLoading) return <LoadingBlock label="Preparing overview" />;
  if (query.isError || !overview) {
    return <ErrorState retry={() => query.refetch()} />;
  }

  const competition = overview.currentCompetition;
  const plan = overview.currentPlan;
  const next = overview.nextAction;

  const remaining = competition ? computeRemaining(competition.deadline) : null;
  const blockedTasks = planTasks.filter((task) => task.status === "blocked");
  const activeStage = stages.find((stage) => stage.state === "active");
  const requirements = competition?.mandatoryDeliverables ?? [];
  const completedRequirements = 0;

  const handleCreated = (newComp: Competition) => {
    setSuccessMessage(
      `Workspace "${newComp.name}" created and saved to persistent database.`,
    );
  };

  return (
    <div className="reveal">
      <PageHeading
        eyebrow="PERSONAL COMMAND CENTER"
        title="Overview"
        detail="The next useful move, with your competition and plan in context."
        action={
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <Button
              onClick={() => setCreateOpen(true)}
              data-testid="button-dashboard-add-competition"
            >
              <Plus size={15} /> New workspace
            </Button>
            <ModuleStatus />
          </div>
        }
      />

      {successMessage && (
        <div
          className="success-banner"
          role="status"
          data-testid="status-dashboard-competition-created"
        >
          <Check size={15} />
          {successMessage}
        </div>
      )}

      <div className="metrics-grid">
        <Metric
          label="Time remaining"
          value={
            competition
              ? remaining?.isPast
                ? "Overdue"
                : remaining?.label ?? "—"
              : "—"
          }
          icon={<Clock3 size={16} />}
          note={
            competition
              ? remaining?.isPast
                ? "Deadline has passed"
                : "Until the submission deadline"
              : "No competition selected"
          }
        />
        <Metric
          label="Workspaces"
          value={overview.competitionCount}
          icon={<Flag size={16} />}
          note="Competition workspaces"
        />
        <Metric
          label="Open tasks"
          value={overview.openTaskCount}
          icon={<ListChecks size={16} />}
          note="Across the active plan"
        />
        <Metric
          label="Blocked"
          value={blockedTasks.length}
          icon={<Ban size={16} />}
          note={blockedTasks.length > 0 ? "Needs a decision" : "Nothing blocked"}
        />
      </div>

      {!competition ? (
        <div className="overview-empty-state">
          <Panel className="overview-empty">
            <div className="empty-orbit">
              <Sparkles size={21} />
            </div>
            <div className="empty-copy">
              <span className="eyebrow">YOUR FIRST WORKSPACE</span>
              <h2>Start with a real deadline.</h2>
              <p>
                Add a competition brief and HackathonOS can organize its rules,
                constraints, and next steps in one place.
              </p>
            </div>
            <Button
              onClick={() => setCreateOpen(true)}
              data-testid="link-add-first-competition"
            >
              <Plus size={15} /> Add a competition
            </Button>
          </Panel>

          <div className="locked-features" aria-label="Locked features requiring a competition">
            <Panel className="locked-feature">
              <div className="locked-feature-icon">
                <Lock size={20} />
              </div>
              <div className="locked-feature-content">
                <div className="locked-feature-header">
                  <h3>Workflow</h3>
                  <Badge variant="default">Locked</Badge>
                </div>
                <p>Lifecycle stages, task progress, and stage unlocks require a competition workspace.</p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="quiet"
                    onClick={() => setCreateOpen(true)}
                    data-testid="button-unlock-workflow"
                  >
                    <Plus size={14} /> Create workspace
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" align="center">
                  <div className="tooltip-content">
                    <AlertCircle size={12} />
                    <span>Create a competition workspace to unlock Workflow</span>
                  </div>
                </TooltipContent>
              </Tooltip>
            </Panel>

            <Panel className="locked-feature">
              <div className="locked-feature-icon">
                <Lock size={20} />
              </div>
              <div className="locked-feature-content">
                <div className="locked-feature-header">
                  <h3>Planner</h3>
                  <Badge variant="default">Locked</Badge>
                </div>
                <p>Generate and manage execution plans tied to a competition deadline.</p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="quiet"
                    onClick={() => setCreateOpen(true)}
                    data-testid="button-unlock-planner"
                  >
                    <Plus size={14} /> Create workspace
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" align="center">
                  <div className="tooltip-content">
                    <AlertCircle size={12} />
                    <span>Create a competition workspace to unlock Planner</span>
                  </div>
                </TooltipContent>
              </Tooltip>
            </Panel>

            <Panel className="locked-feature">
              <div className="locked-feature-icon">
                <Lock size={20} />
              </div>
              <div className="locked-feature-content">
                <div className="locked-feature-header">
                  <h3>Intelligence</h3>
                  <Badge variant="default">Locked</Badge>
                </div>
                <p>Research, idea exploration, and evidence gathering require a competition context.</p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="quiet"
                    onClick={() => setCreateOpen(true)}
                    data-testid="button-unlock-intel"
                  >
                    <Plus size={14} /> Create workspace
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" align="center">
                  <div className="tooltip-content">
                    <AlertCircle size={12} />
                    <span>Create a competition workspace to unlock Intelligence</span>
                  </div>
                </TooltipContent>
              </Tooltip>
            </Panel>
          </div>
        </div>
      ) : (
        <div className="overview-main-grid">
          <Panel className="active-competition">
            <div className="panel-heading-line">
              <span className="eyebrow">CURRENT COMPETITION</span>
              <StatusPill value={competition.status} />
            </div>
            <div className="competition-title-row">
              <div>
                <h2>{competition.name}</h2>
                <p>
                  {competition.organizer || "Organizer not added"}{" "}
                  <span className="tiny-dot" />{" "}
                  {competition.competitionType.replaceAll("_", " ")}
                </p>
              </div>
              <span className="competition-monogram">
                {competition.name.slice(0, 1).toUpperCase()}
              </span>
            </div>
            <div className="competition-facts">
              <div>
                <CalendarClock size={15} />
                <span>Deadline</span>
                <strong>
                  {new Date(competition.deadline).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </strong>
              </div>
              <div>
                <Flag size={15} />
                <span>Track</span>
                <strong>{competition.currentTrack || "Not selected"}</strong>
              </div>
              <div>
                <FileCheck2 size={15} />
                <span>Required outputs</span>
                <strong>
                  {competition.mandatoryDeliverables.length} deliverables
                </strong>
              </div>
            </div>
            <div className="competition-links">
              <Link
                href={`/competitions/${competition.id}`}
                className="text-link"
                data-testid="link-edit-active-competition"
              >
                Review competition details <ArrowRight size={14} />
              </Link>
              <Link
                href={`/competitions/${competition.id}/workflow`}
                className="external-text-link"
                data-testid="link-active-workflow"
              >
                Open workflow <ChevronRight size={14} />
              </Link>
              {competition.officialUrl && (
                <a
                  href={competition.officialUrl}
                  className="external-text-link"
                  target="_blank"
                  rel="noreferrer"
                  data-testid="link-official-competition"
                >
                  Official site
                </a>
              )}
            </div>
          </Panel>

          <Panel className="plan-summary">
            <div className="panel-heading-line">
              <span className="eyebrow">SAVED PLAN</span>
              {plan ? (
                <StatusPill value={plan.status} />
              ) : (
                <StatusPill value="not generated" />
              )}
            </div>
            {plan ? (
              <>
                <div className="plan-version-row">
                  <strong>Version {String(plan.version).padStart(2, "0")}</strong>
                  <span className="mono">
                    {new Date(plan.generatedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="plan-progress-caption">
                  <span>Progress</span>
                  <span>
                    {plan.completedTaskCount} / {plan.taskCount} tasks
                  </span>
                </div>
                <div className="progress-track">
                  <span
                    style={{
                      width: `${plan.taskCount ? Math.round((plan.completedTaskCount / plan.taskCount) * 100) : 0}%`,
                    }}
                  />
                </div>
                {activeStage && (
                  <div className="plan-stage-line">
                    <span className="eyebrow">ACTIVE STAGE</span>
                    <strong>{activeStage.definition.label}</strong>
                    <small>
                      {activeStage.done}/{activeStage.total} tasks ·{" "}
                      {formatDuration(activeStage.estimatedMinutes)} estimated
                    </small>
                  </div>
                )}
                {plan.warnings.length > 0 ? (
                  <div className="plan-warning">
                    <CircleHelp size={15} />
                    <span>{plan.warnings[0]}</span>
                  </div>
                ) : (
                  <div className="plan-warning">
                    <CircleHelp size={15} />
                    <span>
                      Plan status reflects schedule feasibility, not product
                      quality.
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="plan-not-created">
                <Gauge size={19} />
                <strong>No plan saved yet</strong>
                <span>Generate a plan from competition details.</span>
              </div>
            )}
            <Link
              href={`/competitions/${competition.id}/planner`}
              className="button button-secondary full-button"
              data-testid="link-open-planner"
            >
              {plan ? "Open planner" : "Set up a plan"} <ArrowRight size={14} />
            </Link>
          </Panel>
        </div>
      )}

      {competition && (
        <section className="overview-section" aria-labelledby="overview-requirements">
          <div className="section-heading" style={{ marginBottom: "14px" }}>
            <div>
              <span className="eyebrow">BEFORE SUBMISSION</span>
              <h2 id="overview-requirements" style={{ fontSize: "16px", fontWeight: 600 }}>
                Required deliverables
              </h2>
            </div>
            <span className="mono" data-testid="requirements-count">
              {completedRequirements} of {requirements.length} verified
            </span>
          </div>
          {requirements.length === 0 ? (
            <Panel className="requirements-empty">
              <EmptyState
                icon={<FileCheck2 size={21} />}
                title="No required deliverables recorded"
                detail="Add the official submission requirements to the competition so the plan can check them before submission."
                action={
                  <Link
                    href={`/competitions/${competition.id}`}
                    className="button button-secondary"
                    data-testid="link-add-requirements"
                  >
                    Add deliverables <ArrowRight size={14} />
                  </Link>
                }
              />
            </Panel>
          ) : (
            <ul className="requirement-list" data-testid="requirement-list">
              {requirements.map((requirement) => (
                <li className="requirement-row" key={requirement}>
                  <span className="requirement-marker" aria-hidden="true" />
                  <span>{requirement}</span>
                  <span className="requirement-state">Not verified</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {competitions.length > 0 && (
        <section
          style={{ marginTop: "24px" }}
          aria-labelledby="overview-saved"
          data-testid="section-saved-competitions"
        >
          <div className="section-heading" style={{ marginBottom: "14px" }}>
            <div>
              <span className="eyebrow">PERSISTED COMPETITIONS</span>
              <h2 id="overview-saved" style={{ fontSize: "16px", fontWeight: 600 }}>
                Saved Workspaces ({competitions.length})
              </h2>
            </div>
            <Link href="/competitions" className="text-link">
              View all workspaces <ArrowRight size={14} />
            </Link>
          </div>

          <div className="competition-list">
            <div className="list-heading">
              <span>
                WORKSPACE <span className="list-count">{competitions.length}</span>
              </span>
              <span>DEADLINE</span>
              <span>STATUS</span>
              <span />
            </div>
            {competitions.map((item) => (
              <Link
                href={`/competitions/${item.id}`}
                className="competition-row"
                key={item.id}
                data-testid={`dashboard-competition-${item.id}`}
              >
                <span className="comp-row-main">
                  <span className="comp-row-icon">
                    {item.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="comp-row-copy">
                    <strong>{item.name}</strong>
                    <small>
                      {item.organizer || "Organizer not added"}{" "}
                      <span className="tiny-dot" />{" "}
                      {item.competitionType.replaceAll("_", " ")}
                    </small>
                  </span>
                </span>
                <span className="comp-row-deadline">
                  <CalendarClock size={14} />
                  {new Date(item.deadline).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <StatusPill value={item.status} />
                <ArrowRight size={15} className="row-arrow" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="lower-grid">
        <Panel className="next-action-panel">
          <div className="panel-title-row">
            <div>
              <span className="eyebrow">RECOMMENDED NEXT</span>
              <h2>One step at a time.</h2>
            </div>
            <span className="action-index mono">01</span>
          </div>
          {next ? (
            <div className="next-action-content">
              <div className="next-action-label">
                <span
                  className={
                    next.status === "blocked" ? "priority-dot priority-dot-blocked" : "priority-dot"
                  }
                />{" "}
                {next.phase.replaceAll("_", " ")} · {next.estimatedMinutes} min
                {next.status === "blocked" ? " · BLOCKED" : ""}
              </div>
              <h3>{next.title}</h3>
              <p>{next.description}</p>
              {next.acceptanceCriteria.length > 0 && (
                <div className="next-action-criteria">
                  <span className="acceptance-label">
                    <Check size={12} /> DONE WHEN
                  </span>
                  <ul>
                    {next.acceptanceCriteria.slice(0, 2).map((criterion, index) => (
                      <li key={`${next.id}-criterion-${index}`}>{criterion}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Link
                href={`/competitions/${competition!.id}/planner`}
                className="button button-primary"
                data-testid="link-recommended-action"
              >
                Open this task <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <div className="next-action-content">
              <div className="next-action-label">
                <span className="priority-dot idle-dot" /> NO ACTIVE TASK
              </div>
              <h3>
                {competition
                  ? "No immediate task is assigned."
                  : "Create your first competition workspace."}
              </h3>
              <p>
                {competition
                  ? "Generate a plan or review your saved versions to find the next useful step."
                  : "Add a competition and its deadline to get started."}
              </p>
              {competition ? (
                <Link
                  href={`/competitions/${competition.id}/planner`}
                  className="button button-primary"
                  data-testid="link-recommended-action"
                >
                  Open planner <ArrowRight size={14} />
                </Link>
              ) : (
                <Button
                  onClick={() => setCreateOpen(true)}
                  data-testid="link-recommended-action"
                >
                  Create workspace <ArrowRight size={14} />
                </Button>
              )}
            </div>
          )}
        </Panel>

        <Panel className="quality-panel">
          <div className="panel-title-row">
            <div>
              <span className="eyebrow">QUALITY SIGNALS</span>
              <h2>Evidence ledger</h2>
            </div>
            <span className="ledger-icon">
              <BadgeCheck size={16} />
            </span>
          </div>
          <p className="quality-intro">
            No checks are reported as passed without real evidence.
          </p>
          <div className="quality-list">
            {qualityLabels.map(([key, label]) => (
              <div
                className="quality-row"
                key={key}
                data-testid={`quality-${key}`}
              >
                <span className="quality-state-dot" />
                <span>{label}</span>
                <span className="quality-value">{overview.quality[key]}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {blockedTasks.length > 0 && (
        <div className="blocked-banner" role="status" data-testid="banner-blocked-tasks">
          <Ban size={15} />
          <span>
            {blockedTasks.length} saved task{blockedTasks.length === 1 ? " is" : "s are"}{" "}
            blocked. Resolve the blocker before treating the plan as on track.
          </span>
          <Link href={`/competitions/${competition?.id}/planner`} className="text-link">
            Review <ArrowRight size={13} />
          </Link>
        </div>
      )}

      <div className="overview-footnote">
        <ShieldCheck size={14} />
        <span>
          Quality signals stay <code>not_run</code> until verification evidence
          is available.
        </span>
      </div>

      <CompetitionModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}

const qualityLabels = [
  ["applicationBuild", "Application build"],
  ["automatedTests", "Automated tests"],
  ["browserVerification", "Browser verification"],
  ["securityReview", "Security review"],
  ["deployment", "Deployment"],
  ["demoReadiness", "Demo readiness"],
  ["submissionReadiness", "Submission readiness"],
] as const;
