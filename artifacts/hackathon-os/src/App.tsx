import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { ClerkProvider, Show, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { ClerkLoader } from '@/components/ClerkLoader';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Brand, WorkspaceShell } from '@/components/workspace';
import LandingPage from '@/pages/landing';
import NotFound from '@/pages/not-found';
import OverviewPage from '@/pages/overview';

// All competition views are secondary routes — load on demand.
const CompetitionsPage = lazy(() => import('@/pages/competitions'));
const CompetitionDetailPage = lazy(() => import('@/pages/competition-detail'));
const IntelPage = lazy(() => import('@/pages/intel'));
const PlannerPage = lazy(() => import('@/pages/planner'));
const WorkflowPage = lazy(() => import('@/pages/workflow'));
const SettingsPage = lazy(() => import('@/pages/settings'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkProxyUrl =
  import.meta.env.VITE_CLERK_PROXY_URL ??
  (import.meta.env.PROD
    ? new URL('/api/__clerk', window.location.origin).toString()
    : undefined);

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

function validateClerkKey() {
  if (!clerkPubKey) {
    throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  }
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#49c998',
    colorForeground: '#dce4e3',
    colorMutedForeground: '#91a09d',
    colorDanger: '#e16d64',
    colorBackground: '#191d24',
    colorInput: '#1c222a',
    colorInputForeground: '#e1e8e7',
    colorNeutral: '#39414a',
    fontFamily: 'Manrope, sans-serif',
    borderRadius: '0.45rem',
  },
  elements: {
    rootBox: 'relative z-10 w-full max-w-[440px] mx-auto flex justify-center',
    cardBox: 'bg-[#191d24] rounded-xl w-[440px] max-w-full overflow-hidden border border-[#333b44]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#e2e9e8] font-semibold tracking-tight',
    headerSubtitle: 'text-[#9ca8a6]',
    socialButtonsBlockButtonText: 'text-[#dce4e3]',
    formFieldLabel: 'text-[#bbc6c3]',
    footerActionLink: 'text-[#52d2a1] hover:text-[#7ae1ba]',
    footerActionText: 'text-[#9ca8a6]',
    dividerText: 'text-[#889692]',
    identityPreviewEditButton: 'text-[#55d3a2]',
    formFieldSuccessText: 'text-[#72d6ae]',
    alertText: 'text-[#e2e9e8]',
    logoBox: 'mb-2',
    logoImage: 'max-h-8',
    socialButtonsBlockButton: 'border border-[#39414a] bg-[#1d232b] hover:bg-[#242c35]',
    formButtonPrimary: 'bg-[#49c998] text-[#101a17] hover:bg-[#69d9ad]',
    formFieldInput: 'bg-[#1c222a] border-[#39414a] text-[#e1e8e7]',
    footerAction: 'border-t border-[#323a43]',
    dividerLine: 'bg-[#39414a]',
    alert: 'bg-[#2a2022] border-[#593537]',
    otpCodeFieldInput: 'bg-[#1c222a] border-[#39414a] text-[#e1e8e7]',
    formFieldRow: 'gap-1.5',
    main: 'gap-5',
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const priorUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (priorUserId.current !== undefined && priorUserId.current !== userId) {
        client.clear();
      }
      priorUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <WorkspaceShell>
          <OverviewPage />
        </WorkspaceShell>
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function ProtectedPage({ children }: { children: ReactNode }) {
  return (
    <>
      <Show when="signed-in">
        <WorkspaceShell>{children}</WorkspaceShell>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function SignInPage() {
  return (
    <div className="auth-page">
      <div className="auth-orbit auth-orbit-one" />
      <div className="auth-orbit auth-orbit-two" />
      <div className="auth-brand"><Brand /></div>
      <div className="auth-copy">
        <span className="eyebrow">PRIVATE HACKATHON WORKSPACE</span>
        <h1>Back to the<br /><em>build window.</em></h1>
        <p>Your deadlines, constraints, and verified work stay in one place.</p>
      </div>
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
      <div className="auth-footer"><span>HACKATHONOS / ACCESS CONTROL</span><span>PRIVATE BY DESIGN</span></div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="auth-page">
      <div className="auth-orbit auth-orbit-one" />
      <div className="auth-orbit auth-orbit-two" />
      <div className="auth-brand"><Brand /></div>
      <div className="auth-copy">
        <span className="eyebrow">A WORKSPACE OF YOUR OWN</span>
        <h1>Make room<br />for <em>the work.</em></h1>
        <p>Capture a real competition. Keep its requirements and plan close at hand.</p>
      </div>
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
      <div className="auth-footer"><span>HACKATHONOS / CREATE ACCESS</span><span>PRIVATE BY DESIGN</span></div>
    </div>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function RouteFallback() {
  return (
    <div className="loading-state" role="status" aria-label="Loading view">
      <div className="skeleton-line skeleton-wide" />
      <div className="skeleton-line skeleton-medium" />
      <div className="skeleton-block" />
      <span className="loading-label">Loading view…</span>
    </div>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  validateClerkKey();

  // Allow test to override timeout via window global
  const testTimeoutMs = typeof window !== 'undefined' && (window as any).__CLERK_TEST_TIMEOUT_MS__;

  return (
    <ClerkLoader
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: 'Welcome back',
            subtitle: 'Sign in to return to your private workspace.',
          },
        },
        signUp: {
          start: {
            title: 'Create your workspace',
            subtitle: 'One account for your personal competition command center.',
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
      loadTimeoutMs={testTimeoutMs}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkQueryClientCacheInvalidator />
          <RoutedErrorBoundary>
            <Switch>
              <Route path="/" component={HomeRedirect} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              <Route path="/competitions" component={() => <ProtectedPage><Suspense fallback={<RouteFallback />}><CompetitionsPage /></Suspense></ProtectedPage>} />
              <Route path="/competitions/:id/intel" component={() => <ProtectedPage><Suspense fallback={<RouteFallback />}><IntelPage /></Suspense></ProtectedPage>} />
              <Route path="/competitions/:id/workflow" component={() => <ProtectedPage><Suspense fallback={<RouteFallback />}><WorkflowPage /></Suspense></ProtectedPage>} />
              <Route path="/competitions/:id/planner" component={() => <ProtectedPage><Suspense fallback={<RouteFallback />}><PlannerPage /></Suspense></ProtectedPage>} />
              <Route path="/competitions/:id" component={() => <ProtectedPage><Suspense fallback={<RouteFallback />}><CompetitionDetailPage /></Suspense></ProtectedPage>} />
              <Route path="/settings" component={() => <ProtectedPage><Suspense fallback={<RouteFallback />}><SettingsPage /></Suspense></ProtectedPage>} />
              <Route component={NotFound} />
            </Switch>
          </RoutedErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkLoader>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
