import {
  useEffect,
  useState,
  type ReactNode,
  useRef,
  useCallback,
} from "react";
import { ClerkProvider, useAuth } from "@clerk/react";

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

// Error code from Clerk when the script fails to load
const CLERK_FAILED_TO_LOAD_CODE = "failed_to_load_clerk_js";

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

// Internal component that uses Clerk's useAuth to track loaded state
function ClerkLoadedTracker({
  onLoaded,
  onLoadError,
}: {
  onLoaded: () => void;
  onLoadError: (error: Error) => void;
}) {
  const { isLoaded } = useAuth();

  useEffect(() => {
    if (isLoaded) {
      onLoaded();
    }
  }, [isLoaded, onLoaded]);

  // Note: useAuth doesn't expose loadError directly. We rely on the
  // error event listeners in the parent component for load failures.
  // The onLoadError callback is kept for API compatibility.

  return null;
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
  const [initialLoadError, setInitialLoadError] = useState<Error | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [clerkLoaded, setClerkLoaded] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadErrorListenerRef = useRef<((event: ErrorEvent) => void) | null>(
    null,
  );
  const rejectionListenerRef = useRef<
    ((event: PromiseRejectionEvent) => void) | null
  >(null);

  // Clear timeout and remove listeners - called when Clerk loads or on unmount
  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (loadErrorListenerRef.current) {
      window.removeEventListener("error", loadErrorListenerRef.current);
      loadErrorListenerRef.current = null;
    }
    if (rejectionListenerRef.current) {
      window.removeEventListener(
        "unhandledrejection",
        rejectionListenerRef.current,
      );
      rejectionListenerRef.current = null;
    }
  }, []);

  // Start the initial load timeout
  useEffect(() => {
    // Don't start timeout if already loaded
    if (clerkLoaded) return;

    timeoutRef.current = setTimeout(() => {
      setTimedOut(true);
      setInitialLoadError(
        new Error(
          "Authentication service did not load within the expected time",
        ),
      );
    }, loadTimeoutMs);

    // Set up error listeners ONLY for initial load failures
    const handleError = (event: ErrorEvent) => {
      // Only treat actual Clerk script load failures as auth failures
      // Check for the specific Clerk error code or script URL
      const isClerkScriptError =
        event.filename?.includes("clerk") ||
        event.message?.includes(CLERK_FAILED_TO_LOAD_CODE) ||
        (proxyUrl &&
          event.filename?.includes(proxyUrl.replace(/^https?:\/\//, "")));

      if (isClerkScriptError) {
        const failingUrl =
          event.filename ||
          (proxyUrl
            ? `${proxyUrl}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`
            : "unknown");
        setInitialLoadError(
          new Error(`Clerk failed to load: ${event.message} (${failingUrl})`),
        );
        setTimedOut(true);
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      // Only treat Clerk script load rejections
      const isClerkScriptRejection =
        reason?.code === CLERK_FAILED_TO_LOAD_CODE ||
        reason?.message?.includes(CLERK_FAILED_TO_LOAD_CODE) ||
        (proxyUrl &&
          String(reason).includes(proxyUrl.replace(/^https?:\/\//, "")));

      if (isClerkScriptRejection) {
        const failingUrl = proxyUrl
          ? `${proxyUrl}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`
          : "unknown";
        setInitialLoadError(
          new Error(
            `Clerk failed to load: ${reason?.message || reason} (${failingUrl})`,
          ),
        );
        setTimedOut(true);
      }
    };

    loadErrorListenerRef.current = handleError;
    rejectionListenerRef.current = handleRejection;
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      cleanup();
    };
  }, [loadTimeoutMs, proxyUrl, clerkLoaded, cleanup]);

  // Track Clerk's loaded state - clears timeout permanently when loaded
  const handleClerkLoaded = useCallback(() => {
    setClerkLoaded(true);
    cleanup();
  }, [cleanup]);

  const handleClerkLoadError = useCallback(
    (error: Error) => {
      // Only set error if not already loaded (prevents overwriting after load)
      if (!clerkLoaded) {
        setInitialLoadError(error);
        setTimedOut(true);
      }
      cleanup();
    },
    [clerkLoaded, cleanup],
  );

  // Show fallback ONLY during initial load
  if (!clerkLoaded && (initialLoadError || timedOut)) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center bg-[#191d24] p-6"
        data-testid="clerk-fallback"
      >
        <div className="max-w-lg w-full text-center">
          <h1 className="text-xl font-semibold text-[#dce4e3]">
            Authentication Service Unavailable
          </h1>
          <p className="mt-2 text-sm text-[#91a09d]">
            {timedOut
              ? "The authentication service took too long to load. This may be due to network issues or a configuration problem."
              : "The authentication service failed to load."}
          </p>
          <pre className="mt-4 overflow-x-auto rounded bg-[#1c222a] p-3 text-left text-xs text-[#91a09d]">
            {initialLoadError?.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded bg-[#49c998] px-4 py-2 text-sm text-[#101a17] hover:bg-[#69d9ad]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ClerkLoadedTracker
        onLoaded={handleClerkLoaded}
        onLoadError={handleClerkLoadError}
      />
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
    </>
  );
}
