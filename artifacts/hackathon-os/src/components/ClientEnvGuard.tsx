import { getMissingClientEnv } from "@/lib/client-env";

export function ClientEnvGuard({ children }: { children: React.ReactNode }) {
  const missing = getMissingClientEnv();
  if (missing.length > 0) {
    throw new Error(
      `Missing client environment variables: ${missing.join(", ")}`,
    );
  }
  return <>{children}</>;
}
