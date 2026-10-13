import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useClerk, useUser } from '@clerk/react';
import { useHealthCheck } from '@workspace/api-client-react';
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bolt,
  CalendarClock,
  Check,
  ChevronDown,
  Circle,
  CircleHelp,
  Clock3,
  Command,
  ExternalLink,
  FileCheck2,
  Flag,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  ListTodo,
  LockKeyhole,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  X,
} from 'lucide-react';

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

const plannedModules = [
  'Research',
  'Ideas',
  'Agent Command',
  'Testing / Security',
  'Deployment',
  'Demo / Pitch',
  'Submission',
  'Learning',
  'Integrations',
];

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const healthQuery = useHealthCheck();
  const apiStatus = healthQuery.isError ? 'OFFLINE' : healthQuery.data ? 'HEALTHY' : 'CHECKING';
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
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
          <ChevronDown size={14} className="muted-icon" />
        </div>
        <div className="sidebar-caption">WORKSPACE</div>
        <nav className="primary-navigation" aria-label="Workspace navigation">
          <Link
            href="/"
            className={`nav-link ${location === '/' ? 'nav-active' : ''}`}
            data-testid="link-overview"
          >
            <LayoutDashboard size={16} />
            <span>Overview</span>
          </Link>
          <Link
            href="/competitions"
            className={`nav-link ${location.startsWith('/competitions') ? 'nav-active' : ''}`}
            data-testid="link-competitions"
          >
            <FolderKanban size={16} />
            <span>Competitions</span>
            <span className="nav-key">⌘ 1</span>
          </Link>
          <div className="nav-link nav-disabled" aria-disabled="true">
            <ListTodo size={16} />
            <span>Plan queue</span>
            <span className="planned-chip">PLANNED</span>
          </div>
        </nav>
        <div className="sidebar-caption module-caption">PLANNED MODULES</div>
        <div className="planned-list">
          {plannedModules.map((module) => (
            <div className="planned-row" key={module} aria-label={`${module} unavailable`}>
              <span className="planned-dot" />
              <span>{module}</span>
              <LockKeyhole size={11} />
            </div>
          ))}
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
            data-testid="button-open-navigation"
          >
            <Menu size={19} />
          </button>
          <div className="breadcrumbs">
            <span className="breadcrumb-root">HackathonOS</span>
            <span className="breadcrumb-slash">/</span>
            <span className="breadcrumb-current">{getPageLabel(location)}</span>
          </div>
          <div className="topbar-right">
            <span className="environment-label"><span /> PRIVATE WORKSPACE</span>
            <div className="topbar-divider" />
            <span className="topbar-shortcut mono">⌘ K</span>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}

function getPageLabel(location: string) {
  if (location === '/') return 'Overview';
  if (location === '/competitions') return 'Competitions';
  if (location.endsWith('/planner')) return 'Planner';
  return 'Competition details';
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
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="form-field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
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

export const dashboardIcons = {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Bolt,
  CalendarClock,
  Check,
  Circle,
  CircleHelp,
  Clock3,
  Command,
  ExternalLink,
  FileCheck2,
  Flag,
  Gauge,
  LifeBuoy,
  MoreHorizontal,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
};
