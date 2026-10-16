import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useListCompetitions, type Competition } from "@workspace/api-client-react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleHelp,
  FolderKanban,
  Plus,
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
import { CompetitionModal } from "@/components/CompetitionModal";

export default function CompetitionsPage() {
  const [, setLocation] = useLocation();
  const query = useListCompetitions();
  const [createOpen, setCreateOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const items = query.data ?? [];

  const handleCreated = (competition: Competition) => {
    setSuccessMessage(
      `Workspace "${competition.name}" created. Competition details are ready to review.`,
    );
    setLocation(`/competitions/${competition.id}`);
  };

  return (
    <div className="reveal">
      <PageHeading
        eyebrow="YOUR COMPETITION WORKSPACES"
        title="Competitions"
        detail="Keep official requirements and a working plan connected to each deadline."
        action={
          <Button
            onClick={() => setCreateOpen(true)}
            data-testid="button-create-competition"
          >
            <Plus size={15} /> New workspace
          </Button>
        }
      />

      {successMessage && (
        <div
          className="success-banner"
          role="status"
          data-testid="status-competition-created"
        >
          <Check size={15} />
          {successMessage}
        </div>
      )}

      {query.isLoading ? (
        <LoadingBlock label="Loading competitions" />
      ) : query.isError ? (
        <ErrorState
          title="Competition list unavailable"
          retry={() => query.refetch()}
        />
      ) : items.length === 0 ? (
        <Panel className="competition-empty-panel">
          <EmptyState
            icon={<FolderKanban size={23} />}
            title="No competition workspaces yet"
            detail="Start with the event name and submission deadline. You can add rules and deliverables as you go."
            action={
              <Button
                onClick={() => setCreateOpen(true)}
                data-testid="button-create-first-competition"
              >
                <Plus size={15} /> Create a workspace
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="competition-list">
          <div className="list-heading">
            <span>
              WORKSPACE <span className="list-count">{items.length}</span>
            </span>
            <span>DEADLINE</span>
            <span>STATUS</span>
            <span />
          </div>
          {items.map((competition) => (
            <Link
              href={`/competitions/${competition.id}`}
              className="competition-row"
              key={competition.id}
              data-testid={`row-competition-${competition.id}`}
            >
              <span className="comp-row-main">
                <span className="comp-row-icon">
                  {competition.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="comp-row-copy">
                  <strong>{competition.name}</strong>
                  <small>
                    {competition.organizer || "Organizer not added"}{" "}
                    <span className="tiny-dot" />{" "}
                    {competition.competitionType.replaceAll("_", " ")}
                  </small>
                </span>
              </span>
              <span className="comp-row-deadline">
                <CalendarDays size={14} />
                {new Date(competition.deadline).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              <StatusPill value={competition.status} />
              <ArrowRight size={15} className="row-arrow" />
            </Link>
          ))}
        </div>
      )}

      <div className="planned-note">
        <CircleHelp size={15} />
        <span>
          Research and idea exploration are planned modules. The current
          workspace focuses on competition details and verified plans.
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
