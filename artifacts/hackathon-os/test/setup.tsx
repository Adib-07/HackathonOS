import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock Clerk
vi.mock("@clerk/react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useUser: () => ({
      user: {
        id: "user_test",
        fullName: "Test User",
        primaryEmailAddress: { emailAddress: "test@example.com" },
        firstName: "Test",
      },
      isLoaded: true,
      isSignedIn: true,
    }),
    useClerk: () => ({
      signOut: vi.fn(),
    }),
    ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
    SignIn: () => <div data-testid="clerk-sign-in">Sign In</div>,
    SignUp: () => <div data-testid="clerk-sign-up">Sign Up</div>,
  };
});

// Mock wouter
vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
      <a href={href} data-testid={`link-${href}`}>
        {children}
      </a>
    ),
    useLocation: () => ["/", () => {}],
    useRoute: () => [{}],
    Switch: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Route: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Redirect: () => null,
  };
});

// Mock TanStack Query
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    QueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn(),
      getQueryData: vi.fn(),
      setQueryData: vi.fn(),
    })),
    QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
      children,
    useQuery: vi.fn(() => ({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })),
    useMutation: vi.fn(() => ({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    })),
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
    }),
  };
});

// Mock API client
vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useGetOverview: () => ({
      data: {
        currentCompetition: null,
        competitionCount: 0,
        openTaskCount: 0,
        quality: {
          applicationBuild: "not_run",
          automatedTests: "not_run",
          browserVerification: "not_run",
          securityReview: "not_run",
          deployment: "not_run",
          demoReadiness: "not_run",
          submissionReadiness: "not_run",
        },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useListCompetitions: () => ({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useGetCompetition: () => ({
      data: null,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useGetPlan: () => ({
      data: null,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useListPlanVersions: () => ({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useHealthCheck: () => ({
      data: { status: "ok" },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useCreateCompetition: () => ({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    }),
    getListCompetitionsQueryKey: () => ["competitions"],
    getGetOverviewQueryKey: () => ["overview"],
    getGetPlanQueryKey: () => ["plan"],
  };
});

// Mock workflow lib - use actual implementation
vi.mock("@/lib/workflow", async (importOriginal) => {
  const actual = await importOriginal();
  return actual;
});

// Mock components - use actual for workspace components
vi.mock("@/components/workspace", async (importOriginal) => {
  const actual = await importOriginal();
  return actual;
});

// Mock lucide-react icons
vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal();
  const icons = [
    "Activity",
    "ArrowLeft",
    "ArrowRight",
    "BadgeCheck",
    "Ban",
    "CalendarClock",
    "Check",
    "ChevronDown",
    "ChevronRight",
    "CircleDashed",
    "CircleDot",
    "CircleHelp",
    "Clock3",
    "FileCheck2",
    "Flag",
    "FolderKanban",
    "Gauge",
    "Info",
    "LayoutDashboard",
    "ListChecks",
    "ListTodo",
    "Lock",
    "LockKeyhole",
    "LogOut",
    "Menu",
    "Plus",
    "RefreshCw",
    "ShieldCheck",
    "Sparkles",
    "TerminalSquare",
    "X",
  ];
  const mockComponents: Record<string, React.ComponentType<any>> = {};
  for (const icon of icons) {
    mockComponents[icon] = ({ size, ...props }: any) => (
      <svg data-testid={`icon-${icon.toLowerCase()}`} size={size} {...props} />
    );
  }
  return { ...actual, ...mockComponents };
});

// Mock environment
vi.mock("@/lib/client-env", () => ({
  clientEnv: {
    VITE_CLERK_PUBLISHABLE_KEY: "pk_test_mock",
    VITE_CLERK_PROXY_URL: "/api/__clerk",
  },
}));

// Global test utilities
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
