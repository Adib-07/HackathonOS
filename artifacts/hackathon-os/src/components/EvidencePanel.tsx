import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetOverviewQueryKey,
  getGetPlanQueryKey,
  getListEvidenceQueryKey,
  getListPlanVersionsQueryKey,
  useCreateEvidence,
  useDeleteEvidence,
  useListEvidence,
  type Evidence,
  type TaskVerification,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  CircleDashed,
  Clock3,
  ExternalLink,
  Link2,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/workspace";
import {
  EVIDENCE_TYPE_LABELS,
  EVIDENCE_TYPE_RULES,
  EVIDENCE_TYPES,
  VERIFICATION_STATE_LABELS,
  type EvidenceType,
} from "@/lib/evidence-model";

const EVIDENCE_TYPE_OPTIONS: EvidenceType[] = [
  "TEST_RESULT",
  "BUILD_RESULT",
  "DEPLOYMENT_URL",
  "HTTP_CHECK",
  "MANUAL_REVIEW",
  "SUBMISSION_CONFIRMATION",
];

const STATE_ICONS = {
  not_started: <CircleDashed size={13} />,
  in_progress: <Clock3 size={13} />,
  blocked: <Ban size={13} />,
  done: <Check size={13} />,
  verified: <ShieldCheck size={13} />,
} as const;

export interface EvidencePanelProps {
  competitionId: string;
  planId: string;
  taskId: string;
  taskKey: string;
  taskTitle: string;
  verification: TaskVerification;
  /** The task's stated verification method, shown as the requirement. */
  verificationMethod: string;
}

export function EvidencePanel({
  competitionId,
  planId,
  taskId,
  taskKey,
  taskTitle,
  verification,
  verificationMethod,
}: EvidencePanelProps) {
  const queryClient = useQueryClient();
  const listEvidence = useListEvidence(competitionId);
  const createEvidence = useCreateEvidence();
  const deleteEvidence = useDeleteEvidence();

  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [type, setType] = useState<EvidenceType>("TEST_RESULT");
  const [summary, setSummary] = useState("");
  const [result, setResult] = useState<"passed" | "failed">("passed");
  const [sourceUrl, setSourceUrl] = useState("");
  const [commandName, setCommandName] = useState("");
  const [reviewerNote, setReviewerNote] = useState("");
  const [formError, setFormError] = useState("");

  const allEvidence = listEvidence.data ?? [];
  const taskEvidence = allEvidence.filter((item) => item.taskKey === taskKey);

  const rule = EVIDENCE_TYPE_RULES[type];
  const needsSourceUrl = rule.requires === "sourceUrl";
  const needsCommandName = rule.requires === "commandName";

  // The API types these as plain strings, so narrow them to the known set
  // before using them as record keys.
  const isEvidenceType = (value: string): value is EvidenceType =>
    (EVIDENCE_TYPES as readonly string[]).includes(value);
  const requiredTypes = verification.requiredTypes.filter(isEvidenceType);

  const invalidate = async () => {
    // Evidence changes the derived verification state, so the plan and
    // overview caches must be refreshed too, not just the evidence list.
    // Use Promise.allSettled to avoid unhandled rejections if any invalidation fails.
    await Promise.allSettled([
      queryClient.invalidateQueries({
        queryKey: getListEvidenceQueryKey(competitionId),
      }),
      queryClient.invalidateQueries({
        queryKey: getGetPlanQueryKey(competitionId, planId),
      }),
      queryClient.invalidateQueries({
        queryKey: getListPlanVersionsQueryKey(competitionId),
      }),
      queryClient.invalidateQueries({ queryKey: getGetOverviewQueryKey() }),
    ]);
  };

  const resetForm = () => {
    setSummary("");
    setSourceUrl("");
    setCommandName("");
    setReviewerNote("");
    setResult("passed");
    setFormError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createEvidence.isPending) return;

    if (!summary.trim()) {
      setFormError("Describe what was observed.");
      return;
    }
    if (needsSourceUrl && !sourceUrl.trim()) {
      setFormError("This evidence type needs a URL.");
      return;
    }
    if (needsCommandName && !commandName.trim()) {
      setFormError("This evidence type needs the check or command name.");
      return;
    }

    setFormError("");
    try {
      await createEvidence.mutateAsync({
        competitionId,
        taskId,
        data: {
          type,
          summary: summary.trim(),
          result,
          sourceUrl: sourceUrl.trim() || null,
          commandName: commandName.trim() || null,
          reviewerNote: reviewerNote.trim() || null,
        },
      });
      await invalidate();
      resetForm();
      setFormOpen(false);
    } catch {
      // Error is handled by createEvidence.isError in render
    }
  };

  const handleDelete = async (evidence: Evidence) => {
    if (deleteEvidence.isPending) return;
    try {
      await deleteEvidence.mutateAsync({
        competitionId,
        evidenceId: evidence.id,
      });
      await invalidate();
    } catch {
      // Error is handled by deleteEvidence.isError in render
    }
  };

  const stateClass = `verification-state verification-state-${verification.state}`;

  return (
    <section
      className="evidence-panel"
      data-testid={`evidence-panel-${taskId}`}
      aria-label={`Verification evidence for ${taskTitle}`}
    >
      <button
        type="button"
        className="evidence-summary"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={`evidence-body-${taskId}`}
        data-testid={`button-evidence-toggle-${taskId}`}
      >
        <span className={stateClass}>
          {STATE_ICONS[verification.state]}
          {VERIFICATION_STATE_LABELS[verification.state]}
        </span>
        <span className="evidence-summary-text">
          {verification.evidenceCount === 0
            ? "No evidence recorded"
            : `${verification.evidenceCount} evidence ${verification.evidenceCount === 1 ? "record" : "records"}`}
          {verification.verified ? " · requirements satisfied" : ""}
        </span>
        <ChevronDown
          size={14}
          className={`evidence-chevron ${open ? "evidence-chevron-open" : ""}`}
        />
      </button>

      <p className="evidence-reason" data-testid={`evidence-reason-${taskId}`}>
        {verification.reason}
      </p>

      {open && (
        <div
          className="evidence-body"
          id={`evidence-body-${taskId}`}
          data-testid={`evidence-body-${taskId}`}
        >
          <div className="evidence-requirement">
            <span className="eyebrow">REQUIRED TO VERIFY</span>
            <p className="evidence-requirement-method">{verificationMethod}</p>
            <ul className="evidence-requirements">
              {requiredTypes.map((requiredType) => {
                const satisfied =
                  verification.satisfiedTypes.includes(requiredType);
                const failed = verification.failedTypes.includes(requiredType);
                return (
                  <li
                    key={requiredType}
                    className={
                      failed
                        ? "evidence-requirement-item evidence-requirement-failed"
                        : satisfied
                          ? "evidence-requirement-item evidence-requirement-met"
                          : "evidence-requirement-item"
                    }
                  >
                    <span className="evidence-requirement-icon">
                      {failed ? (
                        <AlertTriangle size={12} />
                      ) : satisfied ? (
                        <Check size={12} />
                      ) : (
                        <CircleDashed size={12} />
                      )}
                    </span>
                    <span>{EVIDENCE_TYPE_LABELS[requiredType]}</span>
                    <span className="evidence-requirement-state">
                      {failed ? "Failed" : satisfied ? "Met" : "Needed"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {taskEvidence.length > 0 && (
            <ul
              className="evidence-list"
              data-testid={`evidence-list-${taskId}`}
            >
              {taskEvidence.map((item) => {
                const usable = verification.supportingEvidenceIds.includes(
                  item.id,
                );
                const stale =
                  verification.hasStaleEvidence &&
                  verification.unusableEvidenceIds.includes(item.id);
                return (
                  <li className="evidence-item" key={item.id}>
                    <span
                      className={`evidence-result evidence-result-${item.result}`}
                      aria-hidden="true"
                    >
                      {item.result === "passed" ? (
                        <Check size={11} />
                      ) : (
                        <Ban size={11} />
                      )}
                    </span>
                    <div className="evidence-item-main">
                      <div className="evidence-item-head">
                        <span className="evidence-item-type">
                          {EVIDENCE_TYPE_LABELS[item.type]}
                        </span>
                        <span className="evidence-item-source">
                          {item.source === "manual"
                            ? "Manually supplied"
                            : item.source}
                        </span>
                        {item.result === "failed" && (
                          <span className="evidence-item-badge evidence-item-badge-failed">
                            Failed
                          </span>
                        )}
                        {stale && (
                          <span className="evidence-item-badge evidence-item-badge-stale">
                            Stale
                          </span>
                        )}
                        {usable && (
                          <span className="evidence-item-badge evidence-item-badge-met">
                            Counts
                          </span>
                        )}
                      </div>
                      <p className="evidence-item-summary">{item.summary}</p>
                      <div className="evidence-item-meta">
                        <span>
                          <Clock3 size={11} />{" "}
                          {new Date(item.observedAt).toLocaleString()}
                        </span>
                        {item.commandName && (
                          <span>
                            <Link2 size={11} /> {item.commandName}
                          </span>
                        )}
                        {item.sourceUrl && (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="evidence-item-link"
                          >
                            <ExternalLink size={11} /> Source
                          </a>
                        )}
                      </div>
                      {item.reviewerNote && (
                        <p className="evidence-item-note">
                          {item.reviewerNote}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="icon-button evidence-delete"
                      onClick={() => handleDelete(item)}
                      disabled={deleteEvidence.isPending}
                      aria-label={`Remove evidence: ${item.summary.slice(0, 60)}`}
                      data-testid={`button-evidence-delete-${item.id}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {deleteEvidence.isError && (
            <div className="form-error" role="alert">
              The evidence could not be deleted. Check the connection and try
              again.
            </div>
          )}

          {!formOpen ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setFormOpen(true)}
              data-testid={`button-add-evidence-${taskId}`}
            >
              <Plus size={14} /> Record evidence
            </Button>
          ) : (
            <form className="evidence-form" onSubmit={handleSubmit}>
              <div className="evidence-form-grid">
                <label className="form-field">
                  <span className="field-label">Evidence type</span>
                  <select
                    value={type}
                    onChange={(event) =>
                      setType(event.target.value as EvidenceType)
                    }
                    data-testid={`select-evidence-type-${taskId}`}
                  >
                    {EVIDENCE_TYPE_OPTIONS.map((option) => (
                      <option value={option} key={option}>
                        {EVIDENCE_TYPE_LABELS[option]}
                      </option>
                    ))}
                  </select>
                  <span className="field-hint">{rule.hint}</span>
                </label>

                <label className="form-field">
                  <span className="field-label">Result</span>
                  <select
                    value={result}
                    onChange={(event) =>
                      setResult(event.target.value as "passed" | "failed")
                    }
                    data-testid={`select-evidence-result-${taskId}`}
                  >
                    <option value="passed">Passed</option>
                    <option value="failed">Failed</option>
                  </select>
                  <span className="field-hint">
                    This is your own record of what happened. It is stored as
                    manually supplied evidence.
                  </span>
                </label>
              </div>

              <label className="form-field">
                <span className="field-label">What was observed</span>
                <textarea
                  rows={2}
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  placeholder="e.g. Ran the test suite; 24 tests passed, 0 failed."
                  data-testid={`input-evidence-summary-${taskId}`}
                />
              </label>

              {needsCommandName && (
                <label className="form-field">
                  <span className="field-label">Check or command name</span>
                  <input
                    value={commandName}
                    onChange={(event) => setCommandName(event.target.value)}
                    placeholder="e.g. pnpm test"
                    data-testid={`input-evidence-command-${taskId}`}
                  />
                </label>
              )}

              {needsSourceUrl && (
                <label className="form-field">
                  <span className="field-label">Source URL</span>
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="https://"
                    data-testid={`input-evidence-url-${taskId}`}
                  />
                </label>
              )}

              <label className="form-field">
                <span className="field-label">Reviewer note (optional)</span>
                <input
                  value={reviewerNote}
                  onChange={(event) => setReviewerNote(event.target.value)}
                  placeholder="Anything a reviewer should know"
                  data-testid={`input-evidence-note-${taskId}`}
                />
              </label>

              {formError && (
                <div className="form-error" role="alert">
                  {formError}
                </div>
              )}
              {createEvidence.isError && (
                <div className="form-error" role="alert">
                  The evidence could not be saved. Check the connection and try
                  again.
                </div>
              )}

              <div className="evidence-form-actions">
                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => {
                    setFormOpen(false);
                    resetForm();
                  }}
                  disabled={createEvidence.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createEvidence.isPending}
                  data-testid={`button-save-evidence-${taskId}`}
                >
                  {createEvidence.isPending ? "Saving…" : "Save evidence"}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
