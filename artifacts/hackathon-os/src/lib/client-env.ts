const requiredClientEnv = ["VITE_CLERK_PUBLISHABLE_KEY"] as const;

export function validateClientEnv(): void {
  const missing = requiredClientEnv.filter(key => !import.meta.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing client environment variables: ${missing.join(", ")}`);
  }
}