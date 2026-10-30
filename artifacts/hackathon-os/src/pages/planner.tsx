import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPlanQueryKey,
  getGetOverviewQueryKey,
  getListPlanVersionsQueryKey,
  useGeneratePlan,
  useGetCompetition,
  useGetPlan,
  useListPlanVersions,
  useUpdateTask,
} from "@workspace/api-client-react";
import type { PlanTask, TaskUpdateStatus } from "@workspace/api-client-react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Circle,
  Clock3,
  FileClock,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  Sparkles,
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
import { EvidencePanel } from "@/components/EvidencePanel";
import { phaseLabel } from "@/lib/workflow";

const taskStatuses: TaskUpdateStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "deferred",
];

export default function PlannerPage() {
  const [, params] = useRoute("/competitions/:id/planner");
  const competitionId = params?.id ?? "";
  const client = useQueryClient();
  const competitionQuery = useGetCompetition(competitionId);
  const versionsQuery = useListPlanVersions(competitionId);
  const versions = versionsQuery.data ?? [];
  const latestVersionId = useMemo(() => versions[0]?.id ?? "", [versions]);
  const [chosenVersion, setChosenVersion] = useState("");
  const planId = chosenVersion || latestVersionId;
  const planQuery = useGetPlan(competitionId, planId, {
    query: {
      enabled: !!planId,
      queryKey: getGetPlanQueryKey(competitionId, planId),
    },
  });
  const generatePlan = useGeneratePlan();
  const updateTask = useUpdateTask();
  const [remainingHours, setRemainingHours] = useState("");
  const [taskSaved, setTaskSaved] = useState(false);
  const competition = competitionQuery.data;
  const plan = planQuery.data;

  const recalculate = () => {
    generatePlan.mutate(
      {
        competitionId,
        data: {
          trigger: "manual",
          remainingHours: remainingHours ? Number(remainingHours) : undefined,
        },
      },
      {
        onSuccess: async (savedPlan) => {
          setChosenVersion(savedPlan.id);
          await Promise.all([
            client.invalidateQueries({
              queryKey: getListPlanVersionsQueryKey(competitionId),
            }),
            client.invalidateQueries({ queryKey: getGetOverviewQueryKey() }),
          ]);
        },
      },
    );
  };

  const handleTaskStatus = (task: PlanTask, status: TaskUpdateStatus) => {
    setTaskSaved(false);
    updateTask.mutate(
      { competitionId, taskId: task.id, data: { status } },
      {
        onSuccess: async () => {
          await Promise.all([
            client.invalidateQueries({
              queryKey: getGetPlanQueryKey(competitionId, planId),
            }),
            client.invalidateQueries({
              queryKey: getListPlanVersionsQueryKey(competitionId),
            }),
            client.invalidateQueries({ queryKey: getGetOverviewQueryKey() }),
          ]);
          setTaskSaved(true);
        },
      },
    );
  };

  if (competitionQuery.isLoading || versionsQuery.isLoading)
    return <LoadingBlock label="Loading planner" />;
  if (competitionQuery.isError || !competition)
    return (
      <ErrorState
        title="Competition workspace unavailable"
        retry={() => competitionQuery.refetch()}
      />
    );
  if (versionsQuery.isError)
    return (
      <ErrorState
        title="Saved plan versions unavailable"
        retry={() => versionsQuery.refetch()}
      />
    );

  const phaseGroups =
    plan?.tasks.reduce<Record<string, PlanTask[]>>((groups, task) => {
      groups[task.phase] = [...(groups[task.phase] ?? []), task];
      return groups;
    }, {}) ?? {};
  const orderedGroups = Object.entries(phaseGroups);
  const completedCount =
    plan?.tasks.filter((task) => task.status === "done").length ?? 0;
  const completion = plan?.tasks.length
    ? Math.round((completedCount / plan.tasks.length) * 100)
    : 0;
  const deadlineDate = new Date(competition.deadline);

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
        eyebrow="DEADLINE-AWARE WORK PLAN"
        title="Planner"
        detail="A saved, editable sequence of work tied to this competition's deadline."
        action={<StatusPill value={plan?.status ?? "no plan"} />}
      />
      <div className="planner-toolbar">
        <div className="planner-context">
          <span className="planner-context-mark">
            <Clock3 size={16} />
          </span>
          <span>
            <small>SUBMISSION DEADLINE</small>
            <strong>
              {deadlineDate.toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </strong>
          </span>
        </div>
        <div className="planner-controls">
          {versions.length > 0 && (
            <label className="version-select">
              <FileClock size={15} />
              <span className="sr-only">Choose saved plan version</span>
              <select
                value={planId}
                onChange={(event) => setChosenVersion(event.target.value)}
                data-testid="select-plan-version"
              >
                {versions.map((version) => (
                  <option value={version.id} key={version.id}>
                    Version {String(version.version).padStart(2, "0")} ·{" "}
                    {new Date(version.generatedAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </label>
          )}
          <Button
            onClick={recalculate}
            disabled={generatePlan.isPending}
            data-testid="button-recalculate-plan"
          >
            <RefreshCw
              size={14}
              className={generatePlan.isPending ? "spin-once" : ""}
            />
            {generatePlan.isPending
              ? "Recalculating…"
              : plan
                ? "Recalculate plan"
                : "Generate plan"}
          </Button>
          {plan && (
            <Link
              href={`/competitions/${competitionId}/workflow`}
              className="button button-secondary"
              data-testid="link-planner-workflow"
            >
              <ListChecks size={14} /> Lifecycle view
            </Link>
          )}
        </div>
      </div>
      <div className="planner-detail-grid">
        <div className="planner-main-column">
          {!planId ? (
            <Panel className="planner-empty">
              <EmptyState
                icon={<ListChecks size={23} />}
                title="No saved plan yet"
                detail="Generate a plan from the competition's deadline and constraints. The first version will be saved for review."
                action={
                  <Button
                    onClick={recalculate}
                    disabled={generatePlan.isPending}
                    data-testid="button-generate-first-plan"
                  >
                    <Sparkles size={15} />
                    {generatePlan.isPending
                      ? "Generating…"
                      : "Generate first plan"}
                  </Button>
                }
              />
            </Panel>
          ) : planQuery.isLoading ? (
            <LoadingBlock label="Loading saved plan" />
          ) : planQuery.isError || !plan ? (
            <ErrorState
              title="Could not load this plan version"
              retry={() => planQuery.refetch()}
            />
          ) : (
            <>
              <Panel className="plan-progress-panel">
                <div className="plan-progress-heading">
                  <div>
                    <span className="eyebrow">
                      VERSION {String(plan.version).padStart(2, "0")}
                    </span>
                    <h2>Work sequence</h2>
                  </div>
                  <div className="progress-counter">
                    <strong>
                      {completedCount}
                      <span>/{plan.tasks.length}</span>
                    </strong>
                    <small>tasks complete</small>
                  </div>
                </div>
                <div className="large-progress">
                  <span style={{ width: `${completion}%` }} />
                </div>
                <div className="plan-progress-footer">
                  <span>{completion}% complete</span>
                  <span>
                    <Clock3 size={13} />{" "}
                    {Math.round((plan.availableMinutes / 60) * 10) / 10} hours
                    available
                  </span>
                  <span>{plan.bufferMinutes} min reserved buffer</span>
                </div>
                {plan.warnings.length > 0 && (
                  <div className="plan-warning-banner">
                    <ShieldCheck size={15} />
                    <div>
                      <strong>Plan warning</strong>
                      <span>{plan.warnings.join(" ")}</span>
                    </div>
                  </div>
                )}
                {planId !== latestVersionId && (
                  <div className="plan-warning-banner" role="note">
                    <ShieldCheck size={15} />
                    <div>
                      <strong>Historical version</strong>
                      <span>
                        Task statuses are read-only on saved prior versions.
                      </span>
                    </div>
                  </div>
                )}
              </Panel>
              {orderedGroups.length ? (
                <div className="task-phases">
                  {orderedGroups.map(([phase, tasks], index) => (
                    <section className="task-phase" key={phase}>
                      <div className="phase-heading">
                        <span className="phase-index mono">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <h2>{phaseLabel(phase)}</h2>
                        <span>
                          {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
                        </span>
                      </div>
                      <div className="phase-task-list">
                        {tasks.map((task) => (
                          <TaskCard
                            task={task}
                            competitionId={competitionId}
                            planId={planId}
                            key={task.id}
                            pending={
                              updateTask.isPending &&
                              updateTask.variables?.taskId === task.id
                            }
                            readOnly={planId !== latestVersionId}
                            onStatus={(status) =>
                              handleTaskStatus(task, status)
                            }
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <Panel className="task-empty-panel">
                  <EmptyState
                    icon={<ListChecks size={21} />}
                    title="This plan has no tasks"
                    detail="Recalculate the plan after confirming the competition requirements."
                  />
                </Panel>
              )}
              {updateTask.isError && (
                <div className="form-error task-error" role="alert">
                  Task status could not be saved. Try the status update again.
                </div>
              )}
              {taskSaved && (
                <div
                  className="success-banner task-success"
                  role="status"
                  data-testid="status-task-saved"
                >
                  <Check size={14} />
                  Task status saved.
                </div>
              )}
            </>
          )}
          {generatePlan.isError && (
            <div className="form-error task-error" role="alert">
              Plan generation did not complete. Review deadline and available
              hours, then retry.
            </div>
          )}
        </div>
        <aside className="planner-aside">
          <Panel className="available-time-panel">
            <span className="eyebrow">PLANNING CONSTRAINT</span>
            <h3>How much time can you commit?</h3>
            <p>
              Optional override for the available time used during plan
              generation.
            </p>
            <label className="time-input-wrap">
              <input
                type="number"
                min="0.25"
                max="1000"
                step="0.25"
                value={remainingHours}
                onChange={(event) => setRemainingHours(event.target.value)}
                placeholder="Use deadline window"
                data-testid="input-available-hours"
              />
              <span>hours</span>
            </label>
            <span className="field-hint">
              Leave empty to use the deadline window.
            </span>
          </Panel>
          <Panel className="version-history">
            <div className="history-head">
              <span className="eyebrow">SAVED VERSIONS</span>
              <span className="history-count">{versions.length}</span>
            </div>
            {versions.length ? (
              <div className="version-list">
                {versions.map((version) => (
                  <button
                    className={`version-row ${planId === version.id ? "version-row-active" : ""}`}
                    onClick={() => setChosenVersion(version.id)}
                    key={version.id}
                    data-testid={`button-version-${version.version}`}
                  >
                    <span className="version-bullet">
                      {planId === version.id ? (
                        <Check size={12} />
                      ) : (
                        <Circle size={12} />
                      )}
                    </span>
                    <span className="version-copy">
                      <strong>
                        Version {String(version.version).padStart(2, "0")}
                      </strong>
                      <small>
                        {new Date(version.generatedAt).toLocaleString()}
                      </small>
                    </span>
                    <span className="version-status">
                      {version.status.replaceAll("_", " ")}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="version-empty">
                <FileClock size={17} />
                <span>Generated plans will be listed here for review.</span>
              </div>
            )}
          </Panel>
          <div className="planner-truth">
            <ShieldCheck size={15} />
            <span>
              Task progress is not proof of a successful build, test, security
              review, or submission.
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  competitionId,
  planId,
  pending,
  readOnly,
  onStatus,
}: {
  task: PlanTask;
  competitionId: string;
  planId: string;
  pending: boolean;
  readOnly: boolean;
  onStatus: (status: TaskUpdateStatus) => void;
}) {
  const verification = task.verification;

  return (
    <article
      className={`task-card task-${task.status}`}
      data-testid={`task-card-${task.id}`}
    >
      <div className="task-status-rail">
        <span className="task-status-symbol">
          {task.status === "done" ? <Check size={12} /> : <Circle size={12} />}
        </span>
      </div>
      <div className="task-card-content">
        <div className="task-card-heading">
          <div className="task-title-wrap">
            <h3>{task.title}</h3>
            <div className="task-meta">
              <span className={`priority-label priority-${task.priority}`}>
                {task.priority}
              </span>
              {task.mandatory && (
                <span className="mandatory-label">MANDATORY</span>
              )}
              <span className="task-duration">
                <Clock3 size={12} /> {task.estimatedMinutes} min
              </span>
            </div>
          </div>
          <label className="task-status-control">
            <span className="sr-only">Task status for {task.title}</span>
            <select
              value={task.status}
              onChange={(event) =>
                onStatus(event.target.value as TaskUpdateStatus)
              }
              disabled={pending || readOnly}
              title={
                readOnly ? "Historical plan versions are read-only" : undefined
              }
              data-testid={`select-task-status-${task.id}`}
            >
              {taskStatuses.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <ChevronDown size={12} />
          </label>
        </div>
        <p className="task-description">{task.description}</p>
        <div className="task-acceptance">
          <span className="acceptance-label">
            <Check size={12} /> ACCEPTANCE
          </span>
          {task.acceptanceCriteria.length > 0 ? (
            <ul>
              {task.acceptanceCriteria.map((criterion, index) => (
                <li key={`${task.id}-criterion-${index}`}>{criterion}</li>
              ))}
            </ul>
          ) : (
            <span className="no-acceptance">
              No acceptance criteria provided.
            </span>
          )}
        </div>
        <div className="task-foot">
          {task.expectedArtifact && (
            <span>
              <FileClock size={12} /> Expected artifact: {task.expectedArtifact}
            </span>
          )}
          {task.dependencies.length > 0 && (
            <span>Depends on {task.dependencies.join(", ")}</span>
          )}
          {task.riskIfSkipped && (
            <span className="risk-text">
              Risk if skipped: {task.riskIfSkipped}
            </span>
          )}
        </div>
        {verification && (
          <EvidencePanel
            competitionId={competitionId}
            planId={planId}
            taskId={task.id}
            taskKey={task.taskKey}
            taskTitle={task.title}
            verification={verification}
            verificationMethod={task.verificationMethod}
          />
        )}
      </div>
    </article>
  );
}
