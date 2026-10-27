import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useClerk, useUser } from '@clerk/react';
import { useGetOverview, useHealthCheck } from '@workspace/api-client-react';
import { LIFECYCLE_STAGES } from '@/lib/workflow';
import { useWorkspaceGate } from '@/hooks/useWorkspaceGate';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  LockKeyhole,
  LogOut,
  Menu,
  RefreshCw,
  Shield,
  TerminalSquare,
  Trash2,
  X,
  Info,
  AlertCircle,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand-lockup" data-testid="link-brand">
      <span className="brand-mark" aria-hidden="true">
        <TerminalSquare size={18} strokeWidth={2.1} />
      </span>
      {!compact && (
        <span className="brand-name">
          hackathon<span>os</span>
        </span>
      )}
    </Link>
  );
}

/**
 * Lifecycle stages shown in the sidebar. Stages that a saved plan can back
 * are marked as such; the rest are shown as planned and never as complete.
 * Retrospective unlocks when Submission is complete or the deadline has passed.
 */
const lifecycleStages = LIFECYCLE_STAGES.map((stage) => ({
  id: stage.id,
  label: stage.label,
  planned: stage.planned,
  unlockRule: stage.id === "retrospective"
    ? "Unlocks when Submission is complete or the deadline has passed"
    : stage.planned
    ? `Unlocks when a plan includes ${stage.label.toLowerCase()} tasks`
    : "Shows progress from the saved plan",
}));

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const healthQuery = useHealthCheck();
  const overviewQuery = useGetOverview();
  const apiStatus = healthQuery.isError ? 'OFFLINE' : healthQuery.data ? 'HEALTHY' : 'CHECKING';
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeCompetitionId = overviewQuery.data?.currentCompetition?.id ?? '';
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const gate = useWorkspaceGate();

  // Close the mobile drawer on Escape and return focus to the trigger.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const workflowLocked = gate.isLocked('workflow');
  const workflowUnlockReason = gate.getUnlockReason('workflow');

  return (
    <TooltipProvider>
      <div className="workspace-frame">
        <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
          <div className="sidebar-top">
            <Brand />
            <button
              className="icon-button sidebar-close"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              data-testid="button-close-navigation"
            >
              <X size={17} />
            </button>
          </div>
          <div className="workspace-selector">
            <span className="workspace-glyph">H</span>
            <span className="workspace-meta">
              <strong>Personal workspace</strong>
              <small>PRIVATE · SINGLE USER</small>
            </span>
          </div>
          <div className="sidebar-caption">WORKSPACE</div>
          <nav className="primary-navigation" aria-label="Workspace navigation">
            <Link
              href="/"
              className={`nav-link ${location === '/' ? 'nav-active' : ''}`}
              aria-current={location === '/' ? 'page' : undefined}
              data-testid="link-overview"
            >
              <LayoutDashboard size={16} />
              <span>Overview</span>
            </Link>
            <Link
              href="/competitions"
              className={`nav-link ${location === '/competitions' ? 'nav-active' : ''}`}
              aria-current={location === '/competitions' ? 'page' : undefined}
              data-testid="link-competitions"
            >
              <FolderKanban size={16} />
              <span>Competitions</span>
            </Link>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={activeCompetitionId ? `/competitions/${activeCompetitionId}/workflow` : '/competitions'}
                  className={`nav-link ${location.includes('/workflow') ? 'nav-active' : ''} ${workflowLocked ? 'nav-disabled' : ''}`}
                  aria-current={location.includes('/workflow') ? 'page' : undefined}
                  data-testid="link-workflow"
                  aria-disabled={workflowLocked}
                  tabIndex={workflowLocked ? -1 : undefined}
                  onClick={(e) => {
                    if (workflowLocked) {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                >
                  <ListTodo size={16} />
                  <span>Workflow</span>
                  {workflowLocked && <LockKeyhole size={11} className="nav-lock-icon" />}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                <div className="tooltip-content">
                  <AlertCircle size={12} />
                  <span>{workflowUnlockReason}</span>
                </div>
              </TooltipContent>
            </Tooltip>
            <Link
              href="/settings"
              className={`nav-link ${location === '/settings' ? 'nav-active' : ''}`}
              aria-current={location === '/settings' ? 'page' : undefined}
              data-testid="link-settings"
            >
              <Shield size={16} />
              <span>Settings</span>
            </Link>
          </nav>
          <div className="sidebar-caption module-caption">LIFECYCLE</div>
          <div className="planned-list">
            {lifecycleStages.map((stage) => {
              const isPlanned = stage.planned;
              const tooltipText = stage.unlockRule;
              return (
                <div
                  className={`planned-row ${isPlanned ? '' : 'planned-row-backed'}`}
                  key={stage.id}
                  data-testid={`lifecycle-${stage.id}`}
                  aria-label={tooltipText}
                >
                  <span className="planned-dot" />
                  <span>{stage.label}</span>
                  {isPlanned ? (
                    <span className="planned-lock-tooltip" data-testid={`lifecycle-lock-${stage.id}`}>
                      <LockKeyhole size={11} />
                      <span className="tooltip-text">{stage.unlockRule}</span>
                    </span>
                  ) : (
                    <span className="planned-chip">IN PLAN</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="sidebar-bottom">
            <div className="connection-state">
              <span className={`connection-dot ${healthQuery.isError ? 'connection-dot-error' : ''}`} />
              <span>API connection</span>
              <span className="mono">{apiStatus}</span>
            </div>
            <div className="profile-row">
              <span className="avatar-initials">{(user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0] ?? 'D').toUpperCase()}</span>
              <span className="profile-copy">
                <strong>{user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Developer'}</strong>
                <small>Personal account</small>
              </span>
              <button
                className="icon-button logout-button"
                onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL || '/' })}
                aria-label="Sign out"
                data-testid="button-sign-out"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </aside>
      {mobileOpen && (
        <button
          className="mobile-scrim"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation overlay"
          data-testid="button-navigation-scrim"
        />
      )}
      <main className="workspace-main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            ref={menuButtonRef}
            data-testid="button-open-navigation"
          >
            <Menu size={19} />
          </button>
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <ol className="breadcrumb-list">
              <li>
                <Link href="/" className="breadcrumb-root">
                  HackathonOS
                </Link>
              </li>
              {breadcrumbTrail(location).map((crumb, index) => (
                <li key={crumb.label} className="breadcrumb-item">
                  <span className="breadcrumb-slash" aria-hidden="true">
                    /
                  </span>
                  {index === breadcrumbTrail(location).length - 1 || !crumb.href ? (
                    <span className="breadcrumb-current" aria-current="page">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link href={crumb.href} className="breadcrumb-link">
                      {crumb.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <div className="topbar-right">
            <span className="environment-label"><span /> PRIVATE WORKSPACE</span>
            <div className="topbar-divider" />
            <span className="topbar-shortcut mono">⌘ K</span>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  </TooltipProvider>
  );
}

interface Breadcrumb {
  label: string;
  href?: string;
}

/**
 * Build the breadcrumb trail for a location. The competition name is not
 * known here, so competition routes fall back to a generic label rather than
 * inventing one.
 */
function breadcrumbTrail(location: string): Breadcrumb[] {
  if (location === '/') return [{ label: 'Overview' }];
  if (location === '/competitions') return [{ label: 'Competitions' }];

  const competitionMatch = location.match(/^\/competitions\/([^/]+)(\/(.+))?$/);
  if (competitionMatch) {
    const [, competitionId, , section] = competitionMatch;
    const trail: Breadcrumb[] = [
      { label: 'Competitions', href: '/competitions' },
      { label: 'Competition', href: `/competitions/${competitionId}` },
    ];
    if (section === 'planner') {
      trail.push({ label: 'Planner' });
    } else if (section === 'workflow') {
      trail.push({ label: 'Workflow' });
    }
    return trail;
  }

  return [{ label: 'Overview' }];
}

export function PageHeading({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {detail && <p>{detail}</p>}
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`button button-${variant} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  ...props
}: {
  label: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

export function Panel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`panel ${className}`}>{children}</section>;
}

export function Card({
  children,
  className = '',
  header,
  footer,
}: {
  children: ReactNode;
  className?: string;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {header && <div className="card-header">{header}</div>}
      <div className="card-content">{children}</div>
      {footer && <div className="card-footer">{footer}</div>}
    </section>
  );
}

export function Section({
  children,
  className = '',
  title,
  icon,
  description,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  icon?: ReactNode;
  description?: string;
}) {
  return (
    <section className={`section ${className}`} aria-labelledby={title ? `section-${title.toLowerCase().replace(/\s+/g, '-')}` : undefined}>
      {(title || icon) && (
        <div className="section-head">
          {icon && <span className="section-icon">{icon}</span>}
          {title && <h2 id={`section-${title.toLowerCase().replace(/\s+/g, '-')}`} className="section-title">{title}</h2>}
        </div>
      )}
      {description && <p className="section-description">{description}</p>}
      <div className="section-body">{children}</div>
    </section>
  );
}

export function Badge({
  children,
  variant = 'default',
  className = '',
}: {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'info';
  className?: string;
}) {
  return (
    <span className={`badge badge-${variant} ${className}`} data-testid={`badge-${variant}`}>
      {children}
    </span>
  );
}

export function StatusPill({ value }: { value: string }) {
  const status = value.toLowerCase().replaceAll('_', '-');
  return (
    <span className={`status-pill status-${status}`} data-testid={`status-${status}`}>
      <span className="status-indicator" />
      {value.replaceAll('_', ' ')}
    </span>
  );
}

export function Metric({
  label,
  value,
  icon,
  note,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  note?: string;
}) {
  return (
    <Panel className="metric-panel">
      <div className="metric-top">
        <span className="metric-icon">{icon}</span>
        <span className="metric-label">{label}</span>
      </div>
      <div className="metric-value" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</div>
      {note && <div className="metric-note">{note}</div>}
    </Panel>
  );
}

export function LoadingBlock({ label = 'Loading workspace data' }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-label={label}>
      <div className="skeleton-line skeleton-wide" />
      <div className="skeleton-line skeleton-medium" />
      <div className="skeleton-block" />
      <span className="loading-label">{label}…</span>
    </div>
  );
}

export function ErrorState({
  title = 'Could not load this view',
  detail = 'The request did not complete. Check the connection and try again.',
  retry,
}: {
  title?: string;
  detail?: string;
  retry?: () => void;
}) {
  return (
    <div className="state-box state-error" role="alert" data-testid="state-error">
      <span className="state-icon"><Activity size={17} /></span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      {retry && (
        <Button variant="secondary" onClick={retry} data-testid="button-retry">
          <RefreshCw size={14} />
          Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  detail,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}

export function ModuleStatus() {
  const healthQuery = useHealthCheck();
  const health = healthQuery.data?.status === 'ok' || healthQuery.data?.status === 'healthy';
  return (
    <span className={`health-badge ${health ? 'health-ok' : healthQuery.isError ? 'health-error' : 'health-wait'}`} data-testid="status-api-health">
      <span />
      {health ? 'API online' : healthQuery.isError ? 'API unavailable' : 'Checking API'}
    </span>
  );
}

export function FormField({
  label,
  hint,
  error,
  errorId,
  children,
  required,
}: {
  label: string;
  hint?: string;
  error?: string;
  /** Id for the error message so the control can reference it via aria-describedby. */
  errorId?: string;
  children: ReactNode;
  required?: boolean;
}) {
  const labelId = useId?.() ?? `field-label-${Math.random().toString(36).slice(2)}`;
  const hintId = hint ? `field-hint-${Math.random().toString(36).slice(2)}` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="form-field">
      <label id={labelId} htmlFor={undefined} className="field-label-wrapper">
        <span className="field-label">{label}{required && <span className="required-marker" aria-hidden="true">*</span>}</span>
      </label>
      {children}
      {error && (
        <span className="field-error" id={errorId} role="alert">
          {error}
        </span>
      )}
      {hint && !error && <span id={hintId} className="field-hint">{hint}</span>}
    </div>
  );
}

export function ActionLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="text-link">
      {children}
      <ArrowRight size={14} />
    </Link>
  );
}

// Re-export Tooltip components for convenience
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
