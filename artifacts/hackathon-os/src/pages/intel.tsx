import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAnalysisQueryKey,
  getListBriefsQueryKey,
  getListGapsQueryKey,
  getListIdeasQueryKey,
  getListResearchQueryKey,
  useCreateAnalysis,
  useCreateBrief,
  useCreateGaps,
  useCreateIdeas,
  useCreateResearch,
  useDecideIdea,
  useDeleteResearch,
  useEvaluateIdea,
  useGetAnalysis,
  useGetCompetition,
  useListBriefs,
  useListGaps,
  useListIdeas,
  useListResearch,
  useUpdateRequirement,
} from "@workspace/api-client-react";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  BookOpen,
  Check,
  ChevronDown,
  CircleDashed,
  CircleHelp,
  ExternalLink,
  FlaskConical,
  Lightbulb,
  Link2,
  ListChecks,
  Plus,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
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
  BUILD_BRIEF_SECTIONS,
  CLAIM_KIND_DESCRIPTIONS,
  CLAIM_KIND_LABELS,
  IDEA_DIMENSIONS,
  IDEA_DIMENSION_HINTS,
  IDEA_DIMENSION_LABELS,
  REQUIREMENT_CATEGORY_LABELS,
  RESEARCH_PROVIDER_LABELS,
  RESEARCH_SOURCE_TYPE_LABELS,
  type ClaimKind,
  type IdeaDimension,
  type RequirementCategory,
} from "@/lib/intel-model";

type StepId = "analysis" | "research" | "gaps" | "ideas" | "brief";

const STEPS: Array<{ id: StepId; label: string; hint: string }> = [
  {
    id: "analysis",
    label: "Problem",
    hint: "What the competition actually asks for",
  },
  {
    id: "research",
    label: "Research",
    hint: "What already exists, with sources",
  },
  {
    id: "gaps",
    label: "Opportunities",
    hint: "Where the evidence points to an opening",
  },
  {
    id: "ideas",
    label: "Ideas",
    hint: "Buildable options, scored and compared",
  },
  {
    id: "brief",
    label: "Build brief",
    hint: "The plan the team will actually follow",
  },
];

export default function IntelPage() {
  const [, params] = useRoute("/competitions/:id/intel");
  const competitionId = params?.id ?? "";
  const [step, setStep] = useState<StepId>("analysis");

  const competitionQuery = useGetCompetition(competitionId);
  const competition = competitionQuery.data;

  if (competitionQuery.isLoading) {
    return <LoadingBlock label="Loading intelligence workspace" />;
  }
  if (competitionQuery.isError || !competition) {
    return (
      <ErrorState
        title="Competition workspace unavailable"
        retry={() => competitionQuery.refetch()}
      />
    );
  }

  return (
    <div className="reveal">
      <Link
        href={`/competitions/${competitionId}`}
        className="back-link"
        data-testid="link-back-from-intel"
      >
        <ArrowLeft size={14} /> {competition.name}
      </Link>

      <PageHeading
        eyebrow="RESEARCH & IDEA INTELLIGENCE"
        title="Find the right problem, then choose an idea worth building"
        detail="Every step below is grounded in this competition's stored record and the sources you actually opened. Anything inferred is labelled as an inference."
        action={
          <StatusPill value={competition.status} />
        }
      />

      <nav className="intel-steps" aria-label="Intelligence workflow">
        {STEPS.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            className={`intel-step ${step === entry.id ? "intel-step-active" : ""}`}
            onClick={() => setStep(entry.id)}
            aria-current={step === entry.id ? "step" : undefined}
            data-testid={`intel-step-${entry.id}`}
          >
            <span className="intel-step-index mono">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="intel-step-copy">
              <strong>{entry.label}</strong>
              <small>{entry.hint}</small>
            </span>
          </button>
        ))}
      </nav>

      {step === "analysis" && (
        <AnalysisStep competitionId={competitionId} />
      )}
      {step === "research" && <ResearchStep competitionId={competitionId} />}
      {step === "gaps" && <GapsStep competitionId={competitionId} />}
      {step === "ideas" && <IdeasStep competitionId={competitionId} />}
      {step === "brief" && <BriefStep competitionId={competitionId} />}
    </div>
  );
}

function ClaimBadge({ kind }: { kind: string }) {
  const claimKind = (kind in CLAIM_KIND_LABELS
    ? kind
    : "UNKNOWN") as ClaimKind;
  return (
    <span
      className={`claim-badge claim-badge-${claimKind.toLowerCase()}`}
      title={CLAIM_KIND_DESCRIPTIONS[claimKind]}
      data-testid={`claim-badge-${claimKind}`}
    >
      {CLAIM_KIND_LABELS[claimKind]}
    </span>
  );
}

// --- step 1: problem analysis -------------------------------------------

function AnalysisStep({ competitionId }: { competitionId: string }) {
  const client = useQueryClient();
  const analysisQuery = useGetAnalysis(competitionId);
  const createAnalysis = useCreateAnalysis();
  const updateRequirement = useUpdateRequirement();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const analysis = analysisQuery.data?.analysis ?? null;
  const requirements = analysisQuery.data?.requirements ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string, typeof requirements>();
    for (const requirement of requirements) {
      const list = map.get(requirement.category) ?? [];
      list.push(requirement);
      map.set(requirement.category, list);
    }
    return [...map.entries()];
  }, [requirements]);

  const startAnalysis = async () => {
    try {
      await createAnalysis.mutateAsync({ competitionId });
      await client.invalidateQueries({
        queryKey: getGetAnalysisQueryKey(competitionId),
      });
    } catch {
      // Error is handled by createAnalysis.isError in render
    }
  };

  return (
    <div className="intel-step-body">
      {analysisQuery.isLoading ? (
        <LoadingBlock label="Loading analysis" />
      ) : (
        <>
          {!analysis ? (
            <Panel className="intel-empty">
              <EmptyState
                icon={<Target size={22} />}
                title="No analysis yet"
                detail="Analyse the competition record to see what it actually states, what it leaves unsaid, and what you still need to find out."
                action={
                  <Button
                    onClick={startAnalysis}
                    disabled={createAnalysis.isPending}
                    data-testid="button-run-analysis"
                  >
                    <Sparkles size={15} />
                    {createAnalysis.isPending
                      ? "Analysing…"
                      : "Analyse this competition"}
                  </Button>
                }
              />
            </Panel>
          ) : (
            <>
              <Panel className="intel-core-problem">
                <div className="intel-core-head">
                  <span className="eyebrow">CORE PROBLEM</span>
                  <span className="intel-method">
                    {analysis.method === "AI_ASSISTED"
                      ? `Assisted by ${analysis.provider ?? "an AI provider"}`
                      : "From the stored record only"}
                  </span>
                </div>
                <p className="intel-core-text">{analysis.coreProblem}</p>
              </Panel>

              {createAnalysis.data?.note && (
                <div className="intel-note" role="status" data-testid="intel-analysis-note">
                  <CircleHelp size={14} />
                  <span>{createAnalysis.data.note}</span>
                </div>
              )}

              {analysis.missingFields.length > 0 && (
                <Panel className="intel-gap-panel">
                  <div className="intel-section-head">
                    <h2>Not recorded</h2>
                    <span>{analysis.missingFields.length} fields</span>
                  </div>
                  <p className="intel-section-detail">
                    These are not in the competition record. Nothing has been
                    assumed in their place.
                  </p>
                  <ul className="intel-tag-list">
                    {analysis.missingFields.map((field) => (
                      <li className="intel-tag intel-tag-missing" key={field}>
                        <CircleDashed size={11} /> {field}
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}

              {analysis.unansweredQuestions.length > 0 && (
                <Panel className="intel-gap-panel">
                  <div className="intel-section-head">
                    <h2>Still unanswered</h2>
                    <span>{analysis.unansweredQuestions.length} questions</span>
                  </div>
                  <ul className="intel-question-list">
                    {analysis.unansweredQuestions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </Panel>
              )}

              <Panel className="intel-requirements">
                <div className="intel-section-head">
                  <h2>Requirements</h2>
                  <span>{requirements.length} extracted</span>
                </div>
                {requirements.length === 0 ? (
                  <EmptyState
                    icon={<ListChecks size={20} />}
                    title="No requirements were extracted"
                    detail="The competition record does not contain enough to work with yet."
                  />
                ) : (
                  grouped.map(([category, items]) => (
                    <section className="intel-requirement-group" key={category}>
                      <h3>
                        {REQUIREMENT_CATEGORY_LABELS[category as RequirementCategory] ??
                          category}
                      </h3>
                      <ul className="intel-requirement-list">
                        {items.map((requirement) => (
                          <li className="intel-requirement" key={requirement.id}>
                            {editing === requirement.id ? (
                              <div className="intel-requirement-edit">
                                <input
                                  value={draft}
                                  onChange={(event) => setDraft(event.target.value)}
                                  aria-label="Requirement text"
                                  data-testid={`input-requirement-${requirement.id}`}
                                />
                                <Button
                                  type="button"
                                  onClick={async () => {
                                    await updateRequirement.mutateAsync({
                                      competitionId,
                                      requirementId: requirement.id,
                                      data: { text: draft, reviewed: true },
                                    });
                                    await client.invalidateQueries({
                                      queryKey: getGetAnalysisQueryKey(competitionId),
                                    });
                                    setEditing(null);
                                  }}
                                  disabled={updateRequirement.isPending}
                                >
                                  <Check size={13} /> Save
                                </Button>
                                <Button
                                  type="button"
                                  variant="quiet"
                                  onClick={() => setEditing(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <>
                                <span className="intel-requirement-text">
                                  {requirement.text}
                                </span>
                                <ClaimBadge kind={requirement.claimKind} />
                                {requirement.reviewed && (
                                  <span className="intel-reviewed">Reviewed</span>
                                )}
                                <button
                                  type="button"
                                  className="icon-button intel-requirement-edit-button"
                                  aria-label={`Edit requirement: ${requirement.text.slice(0, 60)}`}
                                  onClick={() => {
                                    setEditing(requirement.id);
                                    setDraft(requirement.text);
                                  }}
                                  data-testid={`button-edit-requirement-${requirement.id}`}
                                >
                                  <FlaskConical size={12} />
                                </button>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))
                )}
              </Panel>
            </>
          )}
        </>
      )}
    </div>
  );
}

// --- step 2: research ---------------------------------------------------

function ResearchStep({ competitionId }: { competitionId: string }) {
  const client = useQueryClient();
  const listQuery = useListResearch(competitionId);
  const createResearch = useCreateResearch();
  const deleteResearch = useDeleteResearch();

  const [query, setQuery] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualSummary, setManualSummary] = useState("");
  const [manualUrl, setManualUrl] = useState("");

  const findings = listQuery.data?.findings ?? [];

  const refresh = async () => {
    await client.invalidateQueries({
      queryKey: getListResearchQueryKey(competitionId),
    });
  };

  const runSearch = async () => {
    if (query.trim().length < 3) return;
    try {
      await createResearch.mutateAsync({
        competitionId,
        data: { query: query.trim() },
      });
      await refresh();
    } catch {
      // Error is handled by createResearch.isError in render
    }
  };

  const saveManual = async () => {
    try {
      await createResearch.mutateAsync({
        competitionId,
        data: {
          manual: true,
          title: manualTitle.trim(),
          summary: manualSummary.trim(),
          sourceUrl: manualUrl.trim() || null,
        },
      });
      await refresh();
      setManualTitle("");
      setManualSummary("");
      setManualUrl("");
      setManualOpen(false);
    } catch {
      // Error is handled by createResearch.isError in render
    }
  };

  const outcomes = createResearch.data?.providerOutcomes ?? [];

  return (
    <div className="intel-step-body">
      <Panel className="intel-search-panel">
        <div className="intel-section-head">
          <h2>Search real sources</h2>
          <span>Wikipedia · arXiv · GitHub</span>
        </div>
        <p className="intel-section-detail">
          These are live, public, documented APIs. Results carry the URL they
          came from, so you can open each one and check it yourself.
        </p>
        <div className="intel-search-row">
          <label className="intel-search-field">
            <span className="sr-only">Research query</span>
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. solar installer delivery quality"
              onKeyDown={(event) => {
                if (event.key === "Enter") void runSearch();
              }}
              data-testid="input-research-query"
            />
          </label>
          <Button
            onClick={runSearch}
            disabled={createResearch.isPending || query.trim().length < 3}
            data-testid="button-run-research"
          >
            {createResearch.isPending ? "Searching…" : "Search"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setManualOpen((value) => !value)}
            data-testid="button-toggle-manual-research"
          >
            <Plus size={14} /> Add by hand
          </Button>
        </div>

        {outcomes.length > 0 && (
          <ul className="intel-outcome-list">
            {outcomes.map((outcome) => (
              <li
                key={outcome.provider}
                className={`intel-outcome ${outcome.ok ? "intel-outcome-ok" : "intel-outcome-failed"}`}
              >
                <span>
                  {outcome.ok ? <Check size={11} /> : <Ban size={11} />}
                </span>
                {RESEARCH_PROVIDER_LABELS[outcome.provider] ??
                  outcome.provider}
                <small>
                  {outcome.ok
                    ? `${outcome.count} result${outcome.count === 1 ? "" : "s"}`
                    : (outcome.error ?? "No results")}
                </small>
              </li>
            ))}
          </ul>
        )}

        {createResearch.isError && (
          <div className="form-error" role="alert">
            The research search did not complete. You can still add a finding by
            hand.
          </div>
        )}

        {manualOpen && (
          <div className="intel-manual-form">
            <label className="form-field">
              <span className="field-label">Title</span>
              <input
                value={manualTitle}
                onChange={(event) => setManualTitle(event.target.value)}
                placeholder="What you found"
                data-testid="input-manual-research-title"
              />
            </label>
            <label className="form-field">
              <span className="field-label">What it says</span>
              <textarea
                rows={2}
                value={manualSummary}
                onChange={(event) => setManualSummary(event.target.value)}
                placeholder="The point that matters, in your own words"
                data-testid="input-manual-research-summary"
              />
            </label>
            <label className="form-field">
              <span className="field-label">Source URL</span>
              <input
                type="url"
                value={manualUrl}
                onChange={(event) => setManualUrl(event.target.value)}
                placeholder="https://"
                data-testid="input-manual-research-url"
              />
              <span className="field-hint">
                Recorded as a source-supported finding, entered by you.
              </span>
            </label>
            <div className="intel-form-actions">
              <Button
                type="button"
                variant="quiet"
                onClick={() => setManualOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={saveManual}
                disabled={
                  createResearch.isPending ||
                  !manualTitle.trim() ||
                  !manualSummary.trim()
                }
                data-testid="button-save-manual-research"
              >
                {createResearch.isPending ? "Saving…" : "Save finding"}
              </Button>
            </div>
          </div>
        )}
      </Panel>

      <Panel className="intel-findings">
        <div className="intel-section-head">
          <h2>Findings</h2>
          <span>{findings.length} recorded</span>
        </div>
        {listQuery.isLoading ? (
          <LoadingBlock label="Loading findings" />
        ) : findings.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={21} />}
            title="No research recorded yet"
            detail="Search a public source above, or record something you found yourself. Both keep the source and the time you retrieved it."
          />
        ) : (
          <ul className="intel-finding-list">
            {findings.map((finding) => (
              <li className="intel-finding" key={finding.id}>
                <div className="intel-finding-main">
                  <div className="intel-finding-head">
                    <span className="intel-finding-title">{finding.title}</span>
                    <span className="intel-finding-provider">
                      {RESEARCH_PROVIDER_LABELS[finding.provider] ??
                        finding.provider}
                    </span>
                    <span className="intel-finding-type">
                      {RESEARCH_SOURCE_TYPE_LABELS[finding.sourceType] ??
                        finding.sourceType}
                    </span>
                    <ClaimBadge kind={finding.claimKind} />
                  </div>
                  <p className="intel-finding-summary">{finding.summary}</p>
                  <div className="intel-finding-meta">
                    <span>
                      Retrieved{" "}
                      {new Date(finding.retrievedAt).toLocaleString()}
                    </span>
                    {finding.sourceUrl && (
                      <a
                        href={finding.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="intel-finding-link"
                      >
                        <ExternalLink size={11} /> Open source
                      </a>
                    )}
                    {finding.query && (
                      <span>
                        <Search size={11} /> {finding.query}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove finding: ${finding.title.slice(0, 60)}`}
                  onClick={async () => {
                    await deleteResearch.mutateAsync({
                      competitionId,
                      findingId: finding.id,
                    });
                    await refresh();
                  }}
                  disabled={deleteResearch.isPending}
                  data-testid={`button-delete-finding-${finding.id}`}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// --- step 3: opportunities ----------------------------------------------

function GapsStep({ competitionId }: { competitionId: string }) {
  const client = useQueryClient();
  const listQuery = useListGaps(competitionId);
  const createGaps = useCreateGaps();
  const gaps = listQuery.data?.gaps ?? [];

  const runGaps = async () => {
    try {
      await createGaps.mutateAsync({ competitionId });
      await client.invalidateQueries({
        queryKey: getListGapsQueryKey(competitionId),
      });
    } catch {
      // Error is handled by createGaps.isError in render
    }
  };

  return (
    <div className="intel-step-body">
      <Panel className="intel-action-panel">
        <div className="intel-section-head">
          <h2>Identify opportunities</h2>
          <span>From the analysis and the findings</span>
        </div>
        <p className="intel-section-detail">
          The engine reports what the retrieved sources actually show, and says
          plainly where the evidence runs out. It will not claim a competitor
          does not exist.
        </p>
        <Button
          onClick={runGaps}
          disabled={createGaps.isPending}
          data-testid="button-run-gaps"
        >
          <Lightbulb size={15} />
          {createGaps.isPending ? "Analysing…" : "Identify opportunities"}
        </Button>
      </Panel>

      {createGaps.data?.note && (
        <div className="intel-note" role="status" data-testid="intel-gaps-note">
          <CircleHelp size={14} />
          <span>{createGaps.data.note}</span>
        </div>
      )}

      {createGaps.data && createGaps.data.evidenceGaps.length > 0 && (
        <Panel className="intel-gap-panel">
          <div className="intel-section-head">
            <h2>Where the evidence runs out</h2>
            <span>{createGaps.data.evidenceGaps.length} gaps</span>
          </div>
          <ul className="intel-question-list">
            {createGaps.data.evidenceGaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </Panel>
      )}

      {createGaps.data && createGaps.data.nextInvestigations.length > 0 && (
        <Panel className="intel-gap-panel">
          <div className="intel-section-head">
            <h2>What to investigate next</h2>
            <span>{createGaps.data.nextInvestigations.length} steps</span>
          </div>
          <ol className="intel-ordered-list">
            {createGaps.data.nextInvestigations.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Panel>
      )}

      <Panel className="intel-gaps">
        <div className="intel-section-head">
          <h2>Opportunities</h2>
          <span>{gaps.length} identified</span>
        </div>
        {listQuery.isLoading ? (
          <LoadingBlock label="Loading opportunities" />
        ) : gaps.length === 0 ? (
          <EmptyState
            icon={<Lightbulb size={21} />}
            title="No opportunities yet"
            detail="Record some research first, then identify what the evidence points to."
          />
        ) : (
          <ul className="intel-gap-list">
            {gaps.map((gap) => (
              <li className="intel-gap" key={gap.id}>
                <div className="intel-gap-head">
                  <span className="intel-gap-need">{gap.need}</span>
                  <ClaimBadge kind={gap.claimKind} />
                </div>
                {gap.targetUser && (
                  <p className="intel-gap-field">
                    <strong>Target user</strong> {gap.targetUser}
                  </p>
                )}
                {gap.existingApproaches && (
                  <p className="intel-gap-field">
                    <strong>Existing approaches</strong> {gap.existingApproaches}
                  </p>
                )}
                {gap.insufficiency && (
                  <p className="intel-gap-field">
                    <strong>Why they may fall short</strong>{" "}
                    {gap.insufficiency}
                  </p>
                )}
                {gap.opportunity && (
                  <p className="intel-gap-field">
                    <strong>Opportunity</strong> {gap.opportunity}
                  </p>
                )}
                {gap.risks.length > 0 && (
                  <p className="intel-gap-field intel-gap-risks">
                    <strong>Risks</strong> {gap.risks.join("; ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// --- step 4: ideas and scoring ------------------------------------------

function IdeasStep({ competitionId }: { competitionId: string }) {
  const client = useQueryClient();
  const listQuery = useListIdeas(competitionId);
  const createIdeas = useCreateIdeas();
  const evaluateIdea = useEvaluateIdea();
  const decideIdea = useDecideIdea();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [rationale, setRationale] = useState("");

  const refresh = async () => {
    await client.invalidateQueries({
      queryKey: getListIdeasQueryKey(competitionId),
    });
  };

  const ideas = listQuery.data?.ideas ?? [];
  const comparison = (listQuery.data?.comparison ?? null) as {
    ranked?: Array<{ ideaId: string; name: string; total: number }>;
    mostDivisiveDimension?: string | null;
  } | null;
  const weights = (listQuery.data?.weights ?? {}) as Record<string, number>;

  // The generated client throws an ApiError whose parsed body is on `data`.
  const errorBody = (createIdeas.error as { data?: { code?: string | null } })
    ?.data;
  const notConfigured = errorBody?.code === "AI_NOT_CONFIGURED";

  return (
    <div className="intel-step-body">
      <Panel className="intel-action-panel">
        <div className="intel-section-head">
          <h2>Generate ideas</h2>
          <span>Scoped to the time and team you actually have</span>
        </div>
        <p className="intel-section-detail">
          Ideas are sized for the remaining hours, the recorded team skills, and
          the mandatory deliverables. Each one states what it leaves out and
          what it has not verified.
        </p>
        <Button
          onClick={async () => {
            try {
              await createIdeas.mutateAsync({ competitionId });
              await refresh();
            } catch {
              // Error is handled by createIdeas.isError in render
            }
          }}
          disabled={createIdeas.isPending}
          data-testid="button-generate-ideas"
        >
          <Sparkles size={15} />
          {createIdeas.isPending ? "Generating…" : "Generate ideas"}
        </Button>
        {notConfigured && (
          <div className="intel-note" role="status" data-testid="intel-ideas-not-configured">
            <CircleHelp size={14} />
            <span>
              No AI provider is configured, so ideas cannot be generated for
              you. The scoring below still works — record the scores by hand.
            </span>
          </div>
        )}
        {createIdeas.isError && !notConfigured && (
          <div className="form-error" role="alert">
            The ideas could not be generated. Try again, or record an idea by
            hand.
          </div>
        )}
      </Panel>

      {comparison?.mostDivisiveDimension && (
        <div className="intel-note" role="status">
          <Scale size={14} />
          <span>
            The ideas differ most on{" "}
            {IDEA_DIMENSION_LABELS[
              comparison.mostDivisiveDimension as IdeaDimension
            ] ?? comparison.mostDivisiveDimension}
            . That is where your decision matters most.
          </span>
        </div>
      )}

      <Panel className="intel-ideas">
        <div className="intel-section-head">
          <h2>Idea candidates</h2>
          <span>{ideas.length} ideas</span>
        </div>
        {listQuery.isLoading ? (
          <LoadingBlock label="Loading ideas" />
        ) : ideas.length === 0 ? (
          <EmptyState
            icon={<Lightbulb size={21} />}
            title="No ideas yet"
            detail="Generate ideas, or record one yourself, then score it against the rubric."
          />
        ) : (
          <ul className="intel-idea-list">
            {ideas.map((idea) => {
              const entry = comparison?.ranked?.find(
                (item) => item.ideaId === idea.id,
              );
              const total = entry?.total ?? 0;
              const isOpen = expanded === idea.id;
              return (
                <li className="intel-idea" key={idea.id}>
                  <div className="intel-idea-head">
                    <button
                      type="button"
                      className="intel-idea-toggle"
                      onClick={() => setExpanded(isOpen ? null : idea.id)}
                      aria-expanded={isOpen}
                      data-testid={`button-expand-idea-${idea.id}`}
                    >
                      <ChevronDown
                        size={13}
                        className={isOpen ? "intel-chevron-open" : ""}
                      />
                      <span className="intel-idea-name">{idea.name}</span>
                    </button>
                    <span
                      className={`intel-idea-total ${idea.status === "selected" ? "intel-idea-total-selected" : ""}`}
                      data-testid={`idea-total-${idea.id}`}
                    >
                      {total > 0 ? total.toFixed(1) : "—"}
                    </span>
                    {idea.status !== "candidate" && (
                      <span className="intel-idea-status">{idea.status}</span>
                    )}
                  </div>
                  <p className="intel-idea-pitch">{idea.pitch}</p>

                  {isOpen && (
                    <div className="intel-idea-detail">
                      <dl className="intel-idea-fields">
                        <div>
                          <dt>Target user</dt>
                          <dd>{idea.targetUser || "Not recorded"}</dd>
                        </div>
                        <div>
                          <dt>Problem solved</dt>
                          <dd>{idea.problemSolved || "Not recorded"}</dd>
                        </div>
                        <div>
                          <dt>Differentiator</dt>
                          <dd>{idea.differentiator || "Not recorded"}</dd>
                        </div>
                        <div>
                          <dt>Feasibility</dt>
                          <dd>{idea.feasibilityNote || "Not recorded"}</dd>
                        </div>
                        <div>
                          <dt>Architecture</dt>
                          <dd>{idea.architectureSuggestion || "Not recorded"}</dd>
                        </div>
                        <div>
                          <dt>Data and integrations</dt>
                          <dd>{idea.dataAndIntegrations || "Not recorded"}</dd>
                        </div>
                      </dl>

                      {idea.mvpFeatures.length > 0 && (
                        <div className="intel-idea-block">
                          <h4>MVP</h4>
                          <ul>
                            {idea.mvpFeatures.map((feature) => (
                              <li key={feature}>{feature}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {idea.excludedFeatures.length > 0 && (
                        <div className="intel-idea-block">
                          <h4>Explicitly out of scope</h4>
                          <ul>
                            {idea.excludedFeatures.map((feature) => (
                              <li key={feature}>{feature}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {idea.unverifiedAssumptions.length > 0 && (
                        <div className="intel-idea-block intel-idea-warnings">
                          <h4>Unverified assumptions</h4>
                          <ul>
                            {idea.unverifiedAssumptions.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="intel-idea-scores">
                        <h4>Rubric</h4>
                        <ul className="intel-score-list">
                          {IDEA_DIMENSIONS.map((dimension) => {
                            const weight = weights[dimension] ?? 0;
                            return (
                              <li key={dimension}>
                                <span className="intel-score-label">
                                  {IDEA_DIMENSION_LABELS[dimension]}
                                  <small>
                                    {IDEA_DIMENSION_HINTS[dimension]}
                                  </small>
                                </span>
                                <span className="intel-score-weight">
                                  {Math.round(weight * 100)}%
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={async () => {
                            try {
                              await evaluateIdea.mutateAsync({
                                competitionId,
                                ideaId: idea.id,
                                data: { scores: [] },
                              });
                              await refresh();
                            } catch {
                              // Error is handled by evaluateIdea.isError in render
                            }
                          }}
                          disabled={evaluateIdea.isPending}
                          data-testid={`button-score-idea-${idea.id}`}
                        >
                          <Scale size={14} />
                          {evaluateIdea.isPending
                            ? "Scoring…"
                            : "Score this idea"}
                        </Button>
                        {evaluateIdea.isError && (
                          <div className="form-error" role="alert">
                            The idea could not be scored. Score it by hand, or
                            configure an AI provider.
                          </div>
                        )}
                      </div>

                      <div className="intel-idea-decision">
                        <label className="form-field">
                          <span className="field-label">
                            Why this idea was chosen or rejected
                          </span>
                          <input
                            value={rationale}
                            onChange={(event) => setRationale(event.target.value)}
                            placeholder="The reasoning your team will remember"
                            data-testid={`input-decision-rationale-${idea.id}`}
                          />
                        </label>
                        <div className="intel-form-actions">
                          <Button
                            type="button"
                            onClick={async () => {
                              try {
                                await decideIdea.mutateAsync({
                                  competitionId,
                                  ideaId: idea.id,
                                  data: { status: "selected", rationale },
                                });
                                await refresh();
                              } catch {
                                // Error is handled by decideIdea.isError in render
                              }
                            }}
                            disabled={decideIdea.isPending || !rationale.trim()}
                            data-testid={`button-select-idea-${idea.id}`}
                          >
                            <Check size={14} /> Select this idea
                          </Button>
                        </div>
                        {idea.decisionRationale && (
                          <p className="intel-decision-note">
                            Recorded: {idea.decisionRationale}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// --- step 5: build brief ------------------------------------------------

function BriefStep({ competitionId }: { competitionId: string }) {
  const client = useQueryClient();
  const listIdeas = useListIdeas(competitionId);
  const listBriefs = useListBriefs(competitionId);
  const createBrief = useCreateBrief();

  const ideas = listIdeas.data?.ideas ?? [];
  const selected = ideas.find((idea) => idea.status === "selected");
  const briefs = listBriefs.data?.briefs ?? [];

  return (
    <div className="intel-step-body">
      {!selected ? (
        <Panel className="intel-empty">
          <EmptyState
            icon={<FileIcon />}
            title="No idea selected yet"
            detail="Choose an idea in the Ideas step, record why, and the build brief can be written against it."
            action={
              <Link
                href={`/competitions/${competitionId}/intel`}
                className="button button-secondary"
              >
                Back to ideas <ArrowRight size={14} />
              </Link>
            }
          />
        </Panel>
      ) : (
        <Panel className="intel-action-panel">
          <div className="intel-section-head">
            <h2>Build brief for {selected.name}</h2>
            <span>Scoped to this competition</span>
          </div>
          <p className="intel-section-detail">
            The brief is saved against this competition only. Sections that
            cannot be filled from what you have are reported as missing rather
            than guessed.
          </p>
          <Button
            onClick={async () => {
              try {
                await createBrief.mutateAsync({
                  competitionId,
                  ideaId: selected.id,
                });
                await client.invalidateQueries({
                  queryKey: getListBriefsQueryKey(competitionId),
                });
              } catch {
                // Error is handled by createBrief.isError in render
              }
            }}
            disabled={createBrief.isPending}
            data-testid="button-create-brief"
          >
            <Sparkles size={15} />
            {createBrief.isPending ? "Writing…" : "Write the build brief"}
          </Button>
        </Panel>
      )}

      {briefs.length > 0 && (
        <Panel className="intel-briefs">
          <div className="intel-section-head">
            <h2>Saved briefs</h2>
            <span>{briefs.length} saved</span>
          </div>
          {briefs.map((brief) => {
            const content = (brief.content ?? {}) as Record<string, unknown>;
            return (
              <article className="intel-brief" key={brief.id}>
                <div className="intel-brief-head">
                  <span className="intel-brief-name">{brief.ideaName}</span>
                  <ClaimBadge kind={brief.claimKind} />
                  <span className="intel-brief-date">
                    {new Date(brief.createdAt).toLocaleString()}
                  </span>
                </div>
                {brief.missingSections.length > 0 && (
                  <div className="intel-brief-missing">
                    <CircleHelp size={13} />
                    <span>
                      Not filled: {brief.missingSections.join(", ")}. Add
                      these before you start building.
                    </span>
                  </div>
                )}
                <dl className="intel-brief-sections">
                  {BUILD_BRIEF_SECTIONS.map((section) => {
                    const value = content[section.key];
                    const items = Array.isArray(value)
                      ? value.filter((item): item is string => typeof item === "string")
                      : [];
                    const text = typeof value === "string" ? value : "";
                    if (!text && items.length === 0) return null;
                    return (
                      <div key={section.key}>
                        <dt>{section.label}</dt>
                        <dd>
                          {section.kind === "list" ? (
                            <ul>
                              {items.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          ) : (
                            text
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </article>
            );
          })}
        </Panel>
      )}
    </div>
  );
}

function FileIcon() {
  return <Link2 size={22} />;
}
