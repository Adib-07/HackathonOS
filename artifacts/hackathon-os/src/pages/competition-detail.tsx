import { useEffect, useState, type FormEvent } from "react";
import { Link, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCompetitionQueryKey,
  getListCompetitionsQueryKey,
  useGetCompetition,
  useUpdateCompetition,
} from "@workspace/api-client-react";
import type { CompetitionUpdate } from "@workspace/api-client-react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileText,
  Save,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  Button,
  ErrorState,
  FormField,
  LoadingBlock,
  PageHeading,
  Panel,
  StatusPill,
} from "@/components/workspace";
import { computeRemaining } from "@/lib/workflow";

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export default function CompetitionDetailPage() {
  const [, params] = useRoute("/competitions/:id");
  const competitionId = params?.id ?? "";
  const client = useQueryClient();
  const query = useGetCompetition(competitionId);
  const update = useUpdateCompetition();
  const competition = query.data;
  const [draft, setDraft] = useState<CompetitionUpdate>({});
  const [deliverablesText, setDeliverablesText] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!competition) return;
    setDraft({
      name: competition.name,
      organizer: competition.organizer,
      competitionType: competition.competitionType,
      startAt: competition.startAt,
      deadline: toDateTimeLocal(competition.deadline),
      teamSize: competition.teamSize,
      trackMode: competition.trackMode,
      currentTrack: competition.currentTrack,
      problemStatement: competition.problemStatement,
      officialUrl: competition.officialUrl,
      rulesUrl: competition.rulesUrl,
      ideaComplexity: competition.ideaComplexity,
      status: competition.status,
    });
    setDeliverablesText(competition.mandatoryDeliverables.join("\n"));
    setSkillsText(competition.teamSkills.join(", "));
  }, [competition]);

  const field = <K extends keyof CompetitionUpdate>(
    key: K,
    value: CompetitionUpdate[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (update.isPending) return;
    setSaved(false);
    const data: CompetitionUpdate = {
      ...draft,
      deadline: draft.deadline
        ? new Date(draft.deadline).toISOString()
        : undefined,
      organizer: draft.organizer?.trim() || null,
      officialUrl: draft.officialUrl?.trim() || null,
      rulesUrl: draft.rulesUrl?.trim() || null,
      currentTrack: draft.currentTrack?.trim() || null,
      problemStatement: draft.problemStatement?.trim() || null,
      mandatoryDeliverables: deliverablesText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      teamSkills: skillsText
        .split(",")
        .map((line) => line.trim())
        .filter(Boolean),
    };
    update.mutate(
      { competitionId, data },
      {
        onSuccess: async () => {
          await Promise.all([
            client.invalidateQueries({
              queryKey: getGetCompetitionQueryKey(competitionId),
            }),
            client.invalidateQueries({
              queryKey: getListCompetitionsQueryKey(),
            }),
          ]);
          setSaved(true);
        },
      },
    );
  };

  if (query.isLoading)
    return <LoadingBlock label="Loading competition details" />;
  if (query.isError || !competition)
    return (
      <ErrorState
        title="Competition details unavailable"
        retry={() => query.refetch()}
      />
    );

  const remaining = computeRemaining(competition.deadline);
  const deliverables = competition.mandatoryDeliverables;
  const missingSources = !competition.officialUrl && !competition.rulesUrl;

  return (
    <div className="reveal">
      <Link
        href="/competitions"
        className="back-link"
        data-testid="link-back-competitions"
      >
        <ArrowLeft size={14} /> All competitions
      </Link>
      <PageHeading
        eyebrow="COMPETITION WORKSPACE"
        title={competition.name}
        detail={`${competition.organizer || "Organizer not specified"} · Created ${new Date(competition.createdAt).toLocaleDateString()}`}
        action={<StatusPill value={competition.status} />}
      />
      <div className="detail-layout">
        <form onSubmit={save} className="detail-form-column">
          <Panel className="form-panel">
            <div className="section-heading">
              <span className="section-icon">
                <FileText size={16} />
              </span>
              <div>
                <h2>Event details</h2>
                <p>Facts from the official competition brief.</p>
              </div>
            </div>
            <div className="form-grid">
              <FormField label="Competition name">
                <input
                  value={draft.name ?? ""}
                  onChange={(event) => field("name", event.target.value)}
                  required
                  maxLength={160}
                  data-testid="input-detail-name"
                />
              </FormField>
              <FormField label="Organizer">
                <input
                  value={draft.organizer ?? ""}
                  onChange={(event) => field("organizer", event.target.value)}
                  data-testid="input-detail-organizer"
                />
              </FormField>
              <FormField label="Start date">
                <input
                  type="datetime-local"
                  value={toDateTimeLocal(draft.startAt)}
                  onChange={(event) =>
                    field(
                      "startAt",
                      event.target.value
                        ? new Date(event.target.value).toISOString()
                        : null,
                    )
                  }
                  data-testid="input-detail-start"
                />
              </FormField>
              <FormField label="Submission deadline">
                <input
                  type="datetime-local"
                  value={draft.deadline ?? ""}
                  onChange={(event) => field("deadline", event.target.value)}
                  required
                  data-testid="input-detail-deadline"
                />
              </FormField>
              <FormField label="Format">
                <select
                  value={draft.competitionType ?? "unknown"}
                  onChange={(event) =>
                    field(
                      "competitionType",
                      event.target
                        .value as CompetitionUpdate["competitionType"],
                    )
                  }
                  data-testid="select-detail-format"
                >
                  <option value="online">Online</option>
                  <option value="in_person">In person</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="unknown">Not specified</option>
                </select>
              </FormField>
              <FormField label="Workspace status">
                <select
                  value={draft.status ?? "preparing"}
                  onChange={(event) =>
                    field(
                      "status",
                      event.target.value as CompetitionUpdate["status"],
                    )
                  }
                  data-testid="select-detail-status"
                >
                  <option value="preparing">Preparing</option>
                  <option value="active">Active</option>
                  <option value="submitted">Submitted</option>
                  <option value="completed">Completed</option>
                </select>
              </FormField>
              <FormField label="Team size">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={draft.teamSize ?? 1}
                  onChange={(event) =>
                    field("teamSize", Number(event.target.value))
                  }
                  data-testid="input-team-size"
                />
              </FormField>
              <FormField label="Track selection">
                <select
                  value={draft.trackMode ?? "choose"}
                  onChange={(event) =>
                    field(
                      "trackMode",
                      event.target.value as CompetitionUpdate["trackMode"],
                    )
                  }
                  data-testid="select-track-mode"
                >
                  <option value="choose">Choose a track</option>
                  <option value="assigned">Assigned track</option>
                </select>
              </FormField>
              <FormField label="Current track">
                <input
                  value={draft.currentTrack ?? ""}
                  onChange={(event) =>
                    field("currentTrack", event.target.value)
                  }
                  placeholder="Track name or not selected"
                  data-testid="input-current-track"
                />
              </FormField>
              <FormField label="Idea complexity (1–5)">
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={draft.ideaComplexity ?? 3}
                  onChange={(event) =>
                    field("ideaComplexity", Number(event.target.value))
                  }
                  data-testid="input-idea-complexity"
                />
              </FormField>
              <FormField label="Official event URL">
                <input
                  type="url"
                  value={draft.officialUrl ?? ""}
                  onChange={(event) => field("officialUrl", event.target.value)}
                  placeholder="https://"
                  data-testid="input-detail-official-url"
                />
              </FormField>
              <FormField label="Rules URL">
                <input
                  type="url"
                  value={draft.rulesUrl ?? ""}
                  onChange={(event) => field("rulesUrl", event.target.value)}
                  placeholder="https://"
                  data-testid="input-detail-rules-url"
                />
              </FormField>
              <FormField
                label="Mandatory deliverables"
                hint="One item per line."
              >
                <textarea
                  rows={4}
                  value={deliverablesText}
                  onChange={(event) => setDeliverablesText(event.target.value)}
                  placeholder="Demo video&#10;Project repository"
                  data-testid="textarea-deliverables"
                />
              </FormField>
              <FormField
                label="Team skills"
                hint="Separate skills with commas."
              >
                <textarea
                  rows={4}
                  value={skillsText}
                  onChange={(event) => setSkillsText(event.target.value)}
                  placeholder="Frontend, product design"
                  data-testid="textarea-team-skills"
                />
              </FormField>
              <FormField label="Problem statement">
                <textarea
                  rows={6}
                  value={draft.problemStatement ?? ""}
                  onChange={(event) =>
                    field("problemStatement", event.target.value)
                  }
                  placeholder="Capture the problem as stated by the organizer."
                  data-testid="textarea-problem-statement"
                />
              </FormField>
            </div>
            {update.isError && (
              <div className="form-error" role="alert">
                Changes could not be saved. Check your connection and retry.
              </div>
            )}
            <div className="form-bottom">
              {saved && (
                <span
                  className="save-confirmation"
                  role="status"
                  data-testid="status-details-saved"
                >
                  <Check size={14} /> Saved successfully
                </span>
              )}
              <Button
                type="submit"
                disabled={update.isPending}
                data-testid="button-save-details"
              >
                <Save size={15} />
                {update.isPending ? "Saving…" : "Save details"}
              </Button>
            </div>
          </Panel>
        </form>
        <aside className="detail-aside">
          <Panel className="detail-context">
            <div className="eyebrow">WORKSPACE CONTEXT</div>
            <div className="context-stat">
              <Users size={15} />
              <span>Team size</span>
              <strong>{competition.teamSize}</strong>
            </div>
            <div className="context-stat">
              <FileText size={15} />
              <span>Required deliverables</span>
              <strong>{deliverables.length}</strong>
            </div>
            <div className="context-stat">
              <Clock3 size={15} />
              <span>Time remaining</span>
              <strong
                className={
                  remaining.isPast
                    ? "context-stat-danger"
                    : remaining.isUrgent
                      ? "context-stat-warning"
                      : ""
                }
              >
                {remaining.isPast ? "Overdue" : remaining.label}
              </strong>
            </div>
            <div className="context-stat">
              <ShieldCheck size={15} />
              <span>Quality checks</span>
              <strong>not_run</strong>
            </div>
            <div className="context-sources">
              {competition.officialUrl && (
                <a
                  href={competition.officialUrl}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="link-detail-official"
                >
                  <ExternalLink size={13} /> Official event
                </a>
              )}
              {competition.rulesUrl && (
                <a
                  href={competition.rulesUrl}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="link-detail-rules"
                >
                  <ExternalLink size={13} /> Official rules
                </a>
              )}
              {missingSources && (
                <span className="context-empty">
                  No source links added yet.
                </span>
              )}
            </div>
            {missingSources && (
              <div className="context-warning">
                <CircleHelp size={13} />
                <span>
                  Without a rules or event link, the plan cannot check your
                  details against the official source.
                </span>
              </div>
            )}
          </Panel>
          <Panel className="detail-next-panel">
            <span className="eyebrow">NEXT</span>
            <h3>Turn these constraints into a working plan.</h3>
            <p>
              Plan versions are saved so changes and recalculations stay
              reviewable.
            </p>
            <Link
              href={`/competitions/${competitionId}/intel`}
              className="button button-primary full-button"
              data-testid="link-detail-intel"
            >
              Research &amp; ideas <ArrowRight size={14} />
            </Link>
            <Link
              href={`/competitions/${competitionId}/workflow`}
              className="button button-secondary full-button detail-next-secondary"
              data-testid="link-detail-workflow"
            >
              Open workflow <ArrowRight size={14} />
            </Link>
            <Link
              href={`/competitions/${competitionId}/planner`}
              className="button button-quiet full-button detail-next-secondary"
              data-testid="link-detail-planner"
            >
              Open planner <ArrowRight size={14} />
            </Link>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
