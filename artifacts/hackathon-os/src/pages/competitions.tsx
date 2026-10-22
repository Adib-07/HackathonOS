import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useListCompetitions, type Competition } from "@workspace/api-client-react";
import {
  ArrowRight,
  CalendarClock,
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
import { computeRemaining } from "@/lib/workflow";

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
          {items.map((competition) => {
            const remaining = computeRemaining(competition.deadline);
            return (
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
                      {competition.currentTrack ? (
                        <>
                          {" "}
                          <span className="tiny-dot" /> {competition.currentTrack}
                        </>
                      ) : null}
                    </small>
                  </span>
                </span>
                <span className="comp-row-deadline">
                  <CalendarClock size={14} />
                  <span className="comp-row-deadline-text">
                    <span>
                      {new Date(competition.deadline).toLocaleDateString(
                        undefined,
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        },
                      )}
                    </span>
                    <small
                      className={
                        remaining.isPast
                          ? "comp-row-remaining comp-row-remaining-late"
                          : remaining.isUrgent
                            ? "comp-row-remaining comp-row-remaining-urgent"
                            : "comp-row-remaining"
                      }
                    >
                      {remaining.isPast ? "Overdue" : `${remaining.label} left`}
                    </small>
                  </span>
                </span>
                <StatusPill value={competition.status} />
                <ArrowRight size={15} className="row-arrow" />
              </Link>
            );
          })}
        </div>
      )}

      <div className="planned-note">
        <CircleHelp size={15} />
        <span>
          Research, idea exploration, and external integrations are planned
          modules. The current workspace focuses on competition details,
          deadline-aware plans, and evidence-based verification.
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
