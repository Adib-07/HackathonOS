import { useEffect, useState, type ReactNode } from 'react';
import { ClerkProvider, useClerk } from '@clerk/react';

interface ClerkLoaderProps {
  children: ReactNode;
  publishableKey: string;
  proxyUrl?: string;
  appearance?: object;
  signInUrl: string;
  signUpUrl: string;
  localization?: object;
  routerPush: (to: string) => void;
  routerReplace: (to: string, options?: unknown) => void;
  /** Optional override for testing */
  loadTimeoutMs?: number;
}

const DEFAULT_CLERK_LOAD_TIMEOUT = 8000; // 8 seconds

function ClerkProviderInner({
  children,
  publishableKey,
  proxyUrl,
  appearance,
  signInUrl,
  signUpUrl,
  localization,
  routerPush,
  routerReplace,
}: ClerkLoaderProps) {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      proxyUrl={proxyUrl}
      appearance={appearance}
      signInUrl={signInUrl}
      signUpUrl={signUpUrl}
      localization={localization}
      routerPush={routerPush}
      routerReplace={routerReplace}
    >
      {children}
    </ClerkProvider>
  );
}

export function ClerkLoader({
  children,
  publishableKey,
  proxyUrl,
  appearance,
  signInUrl,
  signUpUrl,
  localization,
  routerPush,
  routerReplace,
  loadTimeoutMs = DEFAULT_CLERK_LOAD_TIMEOUT,
}: ClerkLoaderProps) {
  const [error, setError] = useState<Error | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
      setError(new Error('Authentication service did not load within the expected time'));
    }, loadTimeoutMs);

    return () => clearTimeout(timer);
  }, [loadTimeoutMs]);

  // Check if Clerk script failed to load
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.filename?.includes('clerk') || event.message?.includes('clerk')) {
        setError(new Error(`Clerk failed to load: ${event.message} (${event.filename})`));
        setTimedOut(true);
      }
    };
    
    // Also listen for unhandled promise rejections (common with failed script loads)
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason?.message?.includes('clerk') || String(reason).includes('clerk')) {
        setError(new Error(`Clerk failed to load: ${reason?.message || reason}`));
        setTimedOut(true);
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-6" data-testid="clerk-fallback">
        <div className="max-w-lg w-full text-center">
          <h1 className="text-xl font-semibold text-gray-900">
            Authentication Service Unavailable
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {timedOut
              ? 'The authentication service took too long to load. This may be due to network issues or a configuration problem.'
              : 'The authentication service failed to load.'}
          </p>
          <pre className="mt-4 overflow-x-auto rounded bg-gray-100 p-3 text-left text-xs text-gray-800">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <ClerkProviderInner
      publishableKey={publishableKey}
      proxyUrl={proxyUrl}
      appearance={appearance}
      signInUrl={signInUrl}
      signUpUrl={signUpUrl}
      localization={localization}
      routerPush={routerPush}
      routerReplace={routerReplace}
    >
      {children}
    </ClerkProviderInner>
  );
}