import { useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileCheck2,
  Flag,
  FolderKanban,
  Gauge,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  useGetOverview,
  useListCompetitions,
  type Competition,
} from "@workspace/api-client-react";
import {
  Button,
  ErrorState,
  LoadingBlock,
  Metric,
  ModuleStatus,
  PageHeading,
  Panel,
  StatusPill,
} from "@/components/workspace";
import { CompetitionModal } from "@/components/CompetitionModal";

const qualityLabels = [
  ["applicationBuild", "Application build"],
  ["automatedTests", "Automated tests"],
  ["browserVerification", "Browser verification"],
  ["securityReview", "Security review"],
  ["deployment", "Deployment"],
  ["demoReadiness", "Demo readiness"],
  ["submissionReadiness", "Submission readiness"],
] as const;

export default function OverviewPage() {
  const query = useGetOverview();
  const competitionsQuery = useListCompetitions();
  const [createOpen, setCreateOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const overview = query.data;
  const competitions = competitionsQuery.data ?? [];

  if (query.isLoading) return <LoadingBlock label="Preparing overview" />;
  if (query.isError || !overview) return <ErrorState retry={() => query.refetch()} />;

  const competition = overview.currentCompetition;
  const plan = overview.currentPlan;
  const next = overview.nextAction;

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
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
          label="Workspaces"
          value={overview.competitionCount}
          icon={<Flag size={16} />}
          note="Competition workspaces"
        />
        <Metric
          label="Open tasks"
          value={overview.openTaskCount}
          icon={<Clock3 size={16} />}
          note="Across the active plan"
        />
        <Metric
          label="Completed tasks"
          value={overview.completedTaskCount}
          icon={<Check size={16} />}
          note="Recorded as done"
        />
        <Metric
          label="Plan quality"
          value="Not run"
          icon={<ShieldCheck size={16} />}
          note="Evidence not connected"
        />
      </div>

      {!competition ? (
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
              {competition.officialUrl && (
                <a
                  href={competition.officialUrl}
                  className="external-text-link"
                  target="_blank"
                  rel="noreferrer"
                  data-testid="link-official-competition"
                >
                  <span>Official site</span>
                  <ChevronRight size={14} />
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
                <div className="plan-warning">
                  <CircleHelp size={15} />
                  <span>
                    {plan.warnings.length
                      ? plan.warnings[0]
                      : "Plan status reflects schedule feasibility, not product quality."}
                  </span>
                </div>
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

      {/* Saved Competitions in Dashboard */}
      {competitions.length > 0 && (
        <section
          style={{ marginTop: "24px" }}
          data-testid="section-saved-competitions"
        >
          <div className="section-heading" style={{ marginBottom: "14px" }}>
            <div>
              <span className="eyebrow">PERSISTED COMPETITIONS</span>
              <h2 style={{ fontSize: "16px", fontWeight: 600 }}>
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
                  <CalendarDays size={14} />
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
                <span className="priority-dot" />{" "}
                {next.phase.replaceAll("_", " ")}{" "}
                <span className="tiny-dot" /> {next.estimatedMinutes} min
              </div>
              <h3>{next.title}</h3>
              <p>{next.description}</p>
              <Link
                href={
                  competition
                    ? `/competitions/${competition.id}/planner`
                    : "/competitions"
                }
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
                <span className="quality-value">not_run</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

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
