import { useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { useClerk, useUser } from '@clerk/react';
import {
  useListCompetitions,
  useUpdateCompetition,
  type CompetitionUpdate,
  type CompetitionUpdateTrackMode,
} from '@workspace/api-client-react';
import {
  ArrowLeft,
  Bell,
  Check,
  Clock3,
  Globe,
  Info,
  Loader2,
  Mail,
  Save,
  Shield,
  Trash2,
  User,
  X,
} from 'lucide-react';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeading,
  Panel,
  StatusPill,
  FormField,
  ActionLink,
} from '@/components/workspace';

interface Competition {
  id: string;
  name: string;
  status: string;
  deadline: string;
  teamSize: number;
  trackMode: string;
}

export default function SettingsPage() {
  const [, params] = useRoute('/settings');
  const { user } = useUser();
  const { signOut } = useClerk();
  const competitionsQuery = useListCompetitions();
  const updateCompetition = useUpdateCompetition();
  const [dangerMode, setDangerMode] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState('');
  const [saving, setSaving] = useState(false);

  const competitions = competitionsQuery.data ?? [];
  const hasCompetitions = competitions.length > 0;

  const handleSaveWorkspace = () => {
    console.log('Saving workspace name:', workspaceName);
  };

  const handleUpdateCompetition = (id: string, data: Partial<CompetitionUpdate>) => {
    updateCompetition.mutate({ competitionId: id, data });
  };

  const handleDeleteCompetition = (id: string) => {
    console.log('Delete competition:', id);
    alert('Delete competition functionality requires API endpoint implementation');
  };

  if (competitionsQuery.isLoading) {
    return <LoadingBlock label="Loading settings" />;
  }
  if (competitionsQuery.isError) {
    return (
      <ErrorState
        title="Could not load competitions"
        retry={() => competitionsQuery.refetch()}
      />
    );
  }

  return (
    <div className="reveal">
      <Link href="/" className="back-link" data-testid="link-back-overview">
        <ArrowLeft size={14} /> Overview
      </Link>

      <PageHeading
        eyebrow="WORKSPACE SETTINGS"
        title="Settings & Integrations"
        detail="Manage your workspace identity, competition defaults, connected tools, and account data."
      />

      <div className="settings-grid">
        {/* Workspace Identity */}
        <section className="settings-section" aria-labelledby="workspace-heading">
          <Panel>
            <div className="settings-section-head">
              <User size={18} />
              <h2 id="workspace-heading">Workspace Identity</h2>
            </div>
            <div className="settings-section-body">
              <FormField label="Workspace name" hint="Shown in the sidebar and browser title">
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="Personal workspace"
                  className="input-field"
                  data-testid="input-workspace-name"
                />
              </FormField>
              <div className="settings-actions">
                <Button
                  variant="primary"
                  onClick={handleSaveWorkspace}
                  disabled={saving || !workspaceName.trim()}
                  data-testid="button-save-workspace"
                >
                  <Save size={14} /> {saving ? 'Saving…' : 'Save workspace name'}
                </Button>
              </div>
            </div>
          </Panel>
        </section>

        {/* Competition Defaults */}
        <section className="settings-section" aria-labelledby="defaults-heading">
          <Panel>
            <div className="settings-section-head">
              <Globe size={18} />
              <h2 id="defaults-heading">Competition Defaults</h2>
            </div>
            <div className="settings-section-body">
              {hasCompetitions ? (
                <div className="competition-defaults-list">
                  {competitions.map((comp) => (
                    <CompetitionDefaultRow
                      key={comp.id}
                      competition={comp}
                      onUpdate={handleUpdateCompetition}
                      onDeleteClick={() => setDangerMode(comp.id)}
                      dangerMode={dangerMode === comp.id}
                      onCancelDanger={() => setDangerMode(null)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<Clock3 size={23} />}
                  title="No competitions yet"
                  detail="Create your first competition to set defaults for future ones."
                  action={
                    <ActionLink href="/competitions" data-testid="link-create-first-competition">
                      Create a competition <ArrowLeft size={14} />
                    </ActionLink>
                  }
                />
              )}
            </div>
          </Panel>
        </section>

        {/* Connected Tools */}
        <section className="settings-section" aria-labelledby="tools-heading">
          <Panel>
            <div className="settings-section-head">
              <Shield size={18} />
              <h2 id="tools-heading">Connected Tools</h2>
            </div>
            <div className="settings-section-body">
              <div className="tools-list">
                <ToolRow
                  name="Clerk Authentication"
                  status="connected"
                  description="User authentication and session management"
                  icon={<Mail size={16} />}
                />
                <ToolRow
                  name="Database (PostgreSQL)"
                  status="connected"
                  description="Primary data store for competitions, plans, and evidence"
                  icon={<Shield size={16} />}
                />
                <ToolRow
                  name="Email Notifications"
                  status="available"
                  description="Configure deadline reminders and status updates"
                  icon={<Bell size={16} />}
                  action={
                    <Button variant="quiet" data-testid="button-configure-email">
                      Configure
                    </Button>
                  }
                />
                <ToolRow
                  name="GitHub Integration"
                  status="available"
                  description="Link repositories and track commits against plan tasks"
                  icon={<Info size={16} />}
                  action={
                    <Button variant="quiet" data-testid="button-configure-github">
                      Connect
                    </Button>
                  }
                />
              </div>
            </div>
          </Panel>
        </section>

        {/* Danger Zone */}
        <section className="settings-section settings-danger-zone" aria-labelledby="danger-heading">
          <Panel className="danger-panel">
            <div className="settings-section-head danger-head">
              <Trash2 size={18} />
              <h2 id="danger-heading">Danger Zone</h2>
            </div>
            <div className="settings-section-body">
              <p className="danger-description">
                Irreversible actions. Deleting a competition removes all its plans, tasks, and evidence.
              </p>
              {hasCompetitions ? (
                <div className="danger-actions">
                  {competitions.map((comp) => (
                    <div
                      key={comp.id}
                      className={`danger-item ${dangerMode === comp.id ? 'danger-confirm' : ''}`}
                    >
                      {dangerMode === comp.id ? (
                        <>
                          <p className="danger-confirm-text">
                            Delete <strong>{comp.name}</strong>? This cannot be undone.
                          </p>
                          <div className="danger-confirm-buttons">
                            <Button
                              variant="danger"
                              onClick={() => handleDeleteCompetition(comp.id)}
                              disabled={updateCompetition.isPending}
                              data-testid={`button-confirm-delete-${comp.id}`}
                            >
                              <Trash2 size={14} />
                              {updateCompetition.isPending ? 'Deleting…' : 'Yes, delete'}
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => setDangerMode(null)}
                              data-testid={`button-cancel-delete-${comp.id}`}
                            >
                              <X size={14} /> Cancel
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="danger-competition-name">{comp.name}</span>
                          <Button
                            variant="quiet"
                            onClick={() => setDangerMode(comp.id)}
                            data-testid={`button-delete-${comp.id}`}
                          >
                            <Trash2 size={14} /> Delete
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="danger-empty">No competitions to delete.</p>
              )}
            </div>
          </Panel>
        </section>
      </div>
    </div>
  );
}

function CompetitionDefaultRow({
  competition,
  onUpdate,
  onDeleteClick,
  dangerMode,
  onCancelDanger,
}: {
  competition: Competition;
  onUpdate: (id: string, data: Partial<CompetitionUpdate>) => void;
  onDeleteClick: () => void;
  dangerMode: boolean;
  onCancelDanger: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(competition.name);

  if (dangerMode) {
    return null; // Handled in danger zone
  }

  const finishEdit = () => {
    if (draftName.trim() && draftName !== competition.name) {
      onUpdate(competition.id, { name: draftName.trim() });
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraftName(competition.name);
    setEditing(false);
  };

  return (
    <div className="competition-default-row">
      <div className="competition-default-main">
        {editing ? (
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && finishEdit()}
            onBlur={finishEdit}
            autoFocus
            className="input-field input-inline"
            data-testid={`input-competition-name-${competition.id}`}
          />
        ) : (
          <span
            className="competition-name"
            onDoubleClick={() => setEditing(true)}
            data-testid={`competition-name-${competition.id}`}
          >
            {competition.name}
          </span>
        )}
        <StatusPill value={competition.status} />
        <span className="competition-meta">
          <Clock3 size={12} /> Deadline: {new Date(competition.deadline).toLocaleDateString()}
        </span>
      </div>
      <div className="competition-default-actions">
        {editing ? (
          <>
            <Button
              variant="primary"
              onClick={finishEdit}
              data-testid={`button-save-competition-${competition.id}`}
            >
              <Check size={12} />
            </Button>
            <Button variant="quiet" onClick={cancelEdit} data-testid={`button-cancel-edit-${competition.id}`}>
              <X size={12} />
            </Button>
          </>
        ) : (
          <>
            <Button variant="quiet" onClick={() => setEditing(true)} data-testid={`button-edit-${competition.id}`}>
              Edit
            </Button>
            <Button variant="quiet" onClick={onDeleteClick} data-testid={`button-delete-trigger-${competition.id}`}>
              <Trash2 size={12} />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function ToolRow({
  name,
  status,
  description,
  icon,
  action,
}: {
  name: string;
  status: 'connected' | 'available';
  description: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="tool-row" data-testid={`tool-${name.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="tool-icon">{icon}</div>
      <div className="tool-info">
        <div className="tool-name-row">
          <strong>{name}</strong>
          <span className={`tool-status tool-status-${status}`}>
            {status === 'connected' ? 'Connected' : 'Available'}
          </span>
        </div>
        <p className="tool-description">{description}</p>
      </div>
      {action && <div className="tool-action">{action}</div>}
    </div>
  );
}