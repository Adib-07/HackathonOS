import { type ComponentType, type ReactNode } from 'react';
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';

export interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  /** Changing this clears a caught error. Pass the route to recover on navigation. */
  resetKey?: unknown;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === 'string') {
    return new Error(value);
  }
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

function DefaultFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  const isConfigError = error.message.includes('Missing client environment variables') ||
    error.message.includes('VITE_');
  
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-lg w-full text-center">
        <h1 className="text-xl font-semibold text-gray-900">
          {isConfigError ? 'Configuration Error' : 'Something went wrong'}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {isConfigError
            ? 'The app cannot start because required environment variables are missing.'
            : 'This part of the app hit an error. The rest of the app is still running.'}
        </p>
        <pre className="mt-4 overflow-x-auto rounded bg-gray-100 p-3 text-left text-xs text-gray-800">
          {error.message || String(error)}
        </pre>
        <button
          type="button"
          onClick={resetErrorBoundary}
          className="mt-4 rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export function ErrorBoundary({
  children,
  FallbackComponent = DefaultFallback,
  resetKey,
}: ErrorBoundaryProps) {
  return (
    <ReactErrorBoundary
      FallbackComponent={FallbackComponent}
      resetKeys={resetKey ? [resetKey] : undefined}
    >
      {children}
    </ReactErrorBoundary>
  );
}