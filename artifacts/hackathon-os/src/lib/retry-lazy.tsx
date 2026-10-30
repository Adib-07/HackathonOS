import {
  type ComponentType,
  lazy,
  Suspense,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface RetryLazyOptions {
  retries?: number;
  retryDelay?: number;
  /** Fallback to show while loading */
  fallback?: ReactNode;
  /** Fallback to show on error */
  errorFallback?: ReactNode;
}

/**
 * Wraps a lazy import with retry logic.
 * On chunk load failure, shows a route-level error panel with a Reload button
 * instead of the auth fallback screen.
 */
export function retryLazy<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  options: RetryLazyOptions = {},
): () => Promise<{ default: ComponentType<any> }> {
  const { retries = 1, retryDelay = 1000, fallback, errorFallback } = options;

  let attempt = 0;

  return async () => {
    while (true) {
      try {
        const module = await importFn();
        return { default: module.default };
      } catch (error) {
        attempt++;
        if (attempt > retries) {
          // Return a component that shows the error fallback
          const ErrorComponent = () => (
            <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#191d24] p-6">
              <div className="max-w-lg w-full text-center">
                <h1 className="text-xl font-semibold text-[#dce4e3]">
                  Could Not Load Page
                </h1>
                <p className="mt-2 text-sm text-[#91a09d]">
                  The page content failed to load. This may be due to a network
                  issue or a deployment update.
                </p>
                <pre className="mt-4 overflow-x-auto rounded bg-[#1c222a] p-3 text-left text-xs text-[#91a09d]">
                  {error instanceof Error ? error.message : String(error)}
                </pre>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-4 rounded bg-[#49c998] px-4 py-2 text-sm text-[#101a17] hover:bg-[#69d9ad]"
                >
                  Reload Page
                </button>
              </div>
            </div>
          );
          return { default: ErrorComponent };
        }
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  };
}

/**
 * Hook to show a non-blocking auth error banner after initial load.
 * Used for session expiry, 401 errors, etc. - NOT for initial Clerk load failures.
 */
export function useAuthErrorBanner() {
  const [authError, setAuthError] = useState<string | null>(null);

  const showAuthError = useCallback((message: string) => {
    setAuthError(message);
    // Auto-dismiss after 10 seconds
    setTimeout(() => setAuthError(null), 10000);
  }, []);

  const dismissAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  return { authError, showAuthError, dismissAuthError };
}

/**
 * Banner component for non-blocking auth errors (session expiry, 401, etc.)
 * Shows at the top of the app without replacing the entire screen.
 */
export function AuthErrorBanner({
  message,
  onDismiss,
  onRetry,
}: {
  message: string;
  onDismiss: () => void;
  onRetry?: () => void;
}) {
  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 bg-[#e16d64] text-white p-4 shadow-lg animate-slide-down"
      role="alert"
      aria-live="polite"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-sm font-medium">{message}</span>
        </div>
        <div className="flex items-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-3 py-1 text-sm font-medium bg-white/20 rounded hover:bg-white/30 transition-colors"
            >
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="px-3 py-1 text-sm font-medium bg-white/20 rounded hover:bg-white/30 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
