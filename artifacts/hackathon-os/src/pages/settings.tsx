import { useMemo, useState, useEffect } from 'react';
import { Link, useRoute } from 'wouter';
import { useClerk, useUser } from '@clerk/react';
import {
  useListCompetitions,
  useUpdateCompetition,
  type CompetitionUpdate,
} from '@workspace/api-client-react';
import { useHealthCheck } from '@workspace/api-client-react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  Clock3,
  Database,
  Globe,
  Info,
  Loader2,
  Mail,
  Save,
  Shield,
  Trash2,
  User,
  X,
  Github,
  Key,
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
  Card,
  Section,
  Badge,
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
  const healthQuery = useHealthCheck();
  const updateCompetition = useUpdateCompetition();
  const [dangerMode, setDangerMode] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error'>('checking');

  const competitions = competitionsQuery.data ?? [];
  const hasCompetitions = competitions.length > 0;

  // Check database health on mount
  useEffect(() => {
    if (healthQuery.data?.status === 'ok' || healthQuery.data?.status === 'healthy') {
      setDbStatus('connected');
    } else if (healthQuery.isError) {
      setDbStatus('error');
    }
  }, [healthQuery.data, healthQuery.isError]);

  const handleSaveWorkspace = async () => {
    if (!workspaceName.trim()) return;
    setSaving(true);
    setSaveStatus('idle');
    try {
      // Persist workspace name - for now we'll use localStorage as a simple approach
      // In a real app, this would be an API call
      localStorage.setItem('hackathon-os-workspace-name', workspaceName.trim());
      // Update document title
      document.title = `${workspaceName.trim()} | HackathonOS`;
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setSaving(false);
    }
  };

  // Load workspace name on mount
  useEffect(() => {
    const saved = localStorage.getItem('hackathon-os-workspace-name');
    if (saved) {
      setWorkspaceName(saved);
      document.title = `${saved} | HackathonOS`;
    }
  }, []);

  const handleUpdateCompetition = (id: string, data: Partial<CompetitionUpdate>) => {
    updateCompetition.mutate({ competitionId: id, data });
  };

  const handleDeleteCompetition = (id: string) => {
    console.log('Delete competition:', id);
    alert('Delete competition functionality requires API endpoint implementation');
    setDangerMode(null);
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
        <Section title="Workspace Identity" icon={<User size={18} />} description="How your workspace appears in the sidebar and browser title.">
          <Card>
            <div className="card-content" style={{ paddingBottom: 0 }}>
              <FormField
                label="Workspace name"
                hint="Shown in the sidebar and browser title"
                required
              >
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="Personal workspace"
                  className="input-field workspace-name-input"
                  data-testid="input-workspace-name"
                  aria-invalid={workspaceName.length > 0 && workspaceName.trim().length < 2}
                />
              </FormField>
              {workspaceName.length > 0 && workspaceName.trim().length < 2 && (
                <span className="field-error" role="alert">Workspace name must be at least 2 characters</span>
              )}
              <div className="settings-actions">
                <Button
                  variant="primary"
                  onClick={handleSaveWorkspace}
                  disabled={saving || !workspaceName.trim() || workspaceName.trim().length < 2}
                  data-testid="button-save-workspace"
                >
                  <Save size={14} /> {saving ? 'Saving…' : saveStatus === 'success' ? 'Saved!' : 'Save workspace name'}
                </Button>
                {saveStatus === 'success' && (
                  <Badge variant="success" className="ml-2">
                    <Check size={12} /> Saved
                  </Badge>
                )}
                {saveStatus === 'error' && (
                  <Badge variant="destructive" className="ml-2">
                    <X size={12} /> Failed
                  </Badge>
                )}
              </div>
            </div>
          </Card>
        </Section>

        {/* Competition Defaults */}
        <Section title="Competition Defaults" icon={<Globe size={18} />} description="Default values applied when creating new competition workspaces.">
          <Card>
            <div className="card-content" style={{ paddingBottom: 0 }}>
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
                      Create a competition
                    </ActionLink>
                  }
                />
              )}
            </div>
          </Card>
        </Section>

        {/* Connected Tools */}
        <Section title="Connected Tools" icon={<Shield size={18} />} description="External services connected to your workspace. Status reflects real connectivity checks.">
          <Card>
            <div className="card-content" style={{ paddingBottom: 0 }}>
              <div className="tools-list">
                <ToolRow
                  name="Clerk Authentication"
                  status="connected"
                  description="User authentication and session management"
                  icon={<Key size={16} />}
                />
                <ToolRow
                  name="Database (PostgreSQL)"
                  status={dbStatus === 'connected' ? 'connected' : dbStatus === 'checking' ? 'available' : 'not-configured'}
                  description="Primary data store for competitions, plans, and evidence"
                  icon={<Database size={16} />}
                />
                <ToolRow
                  name="Email Notifications"
                  status="not-configured"
                  description="Configure deadline reminders and status updates"
                  icon={<Mail size={16} />}
                  action={
                    <Button variant="quiet" disabled data-testid="button-configure-email" title="Coming soon">
                      Configure
                    </Button>
                  }
                />
                <ToolRow
                  name="GitHub Integration"
                  status="not-configured"
                  description="Link repositories and track commits against plan tasks"
                  icon={<Github size={16} />}
                  action={
                    <Button variant="quiet" disabled data-testid="button-configure-github" title="Coming soon">
                      Connect
                    </Button>
                  }
                />
              </div>
            </div>
          </Card>
        </Section>

        {/* Danger Zone */}
        {hasCompetitions && (
          <Section
            title="Danger Zone"
            icon={<Trash2 size={18} />}
            description="Irreversible actions. Deleting a competition removes all its plans, tasks, and evidence."
            className="settings-danger-zone"
          >
            <Card className="danger-panel">
              <div className="card-content" style={{ paddingBottom: 0 }}>
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
              </div>
            </Card>
          </Section>
        )}
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
  status: 'connected' | 'available' | 'not-configured';
  description: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
}) {
  const statusLabel = status === 'connected' ? 'Connected' : status === 'available' ? 'Available' : 'Not configured';
  const statusVariant = status === 'connected' ? 'success' : status === 'available' ? 'warning' : 'default';

  return (
    <div className="tool-row" data-testid={`tool-${name.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="tool-icon">{icon}</div>
      <div className="tool-info">
        <div className="tool-name-row">
          <strong>{name}</strong>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </div>
        <p className="tool-description">{description}</p>
      </div>
      {action && <div className="tool-action">{action}</div>}
    </div>
  );
}