const requiredClientEnv = ["VITE_CLERK_PUBLISHABLE_KEY"] as const;

export function getMissingClientEnv(): readonly string[] {
  return requiredClientEnv.filter(key => !import.meta.env[key]);
}

export function validateClientEnv(): void {
  const missing = getMissingClientEnv();
  if (missing.length > 0) {
    throw new Error(`Missing client environment variables: ${missing.join(", ")}`);
  }
}