/**
 * Provider-independent AI interface.
 *
 * The product only ever calls `completeJson`. Everything provider-specific
 * lives behind this boundary so the rest of the engine never learns which
 * vendor is configured, and so a missing or failing provider produces one
 * predictable error shape instead of a wall of vendor SDK errors.
 */

/** A single chat message. */
export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCompletionRequest {
  /** System instructions. The model is told to answer with JSON only. */
  system: string;
  /** The user prompt. */
  user: string;
  /** Short description used in logs and error messages. Never contains secrets. */
  purpose: string;
  /** Hard limit on how long the model may take. */
  timeoutMs?: number;
}

export interface AiCompletionResult {
  /** The parsed JSON object the model returned. */
  data: Record<string, unknown>;
  /** Which provider produced this. */
  provider: string;
  /** The model identifier used. */
  model: string;
  /** How long the call took. */
  durationMs: number;
}

/** Why an AI call could not be completed. */
export type AiFailureKind =
  | "NOT_CONFIGURED"
  | "TIMEOUT"
  | "UPSTREAM_ERROR"
  | "MALFORMED_OUTPUT"
  | "RATE_LIMITED";

export class AiError extends Error {
  readonly kind: AiFailureKind;
  /** A message that is safe to show a user and safe to log. */
  readonly detail: string;

  constructor(kind: AiFailureKind, detail: string) {
    super(detail);
    this.name = "AiError";
    this.kind = kind;
    this.detail = detail;
  }
}

/**
 * The single interface the engine depends on.
 */
export interface AiProvider {
  /** Stable identifier, e.g. "openai". */
  readonly id: string;
  /** The model identifier in use. */
  readonly model: string;
  /** Whether this provider can actually run right now. */
  readonly available: boolean;
  /**
   * Runs a completion and returns parsed JSON.
   * Throws `AiError` with a `kind` for every failure mode.
   */
  completeJson(request: AiCompletionRequest): Promise<AiCompletionResult>;
}

/** Configuration problems, surfaced with a clear message rather than a crash. */
export function aiConfigurationError(
  missing: string[],
): AiError {
  return new AiError(
    "NOT_CONFIGURED",
    `The AI provider is not configured. Missing: ${missing.join(", ")}.`,
  );
}
