/**
 * The single AI provider integration.
 *
 * This speaks the OpenAI chat-completions API, which is also the shape most
 * self-hosted and gateway deployments expose. Configuration is entirely
 * environment driven:
 *
 *   OPENAI_API_KEY   required, never logged, never returned to a client
 *   OPENAI_BASE_URL  optional, defaults to the public OpenAI endpoint
 *   OPENAI_MODEL     optional, defaults to gpt-4o-mini
 *
 * Only one provider is implemented on purpose. The engine depends on the
 * `AiProvider` interface, not on this class.
 */
import {
  AiError,
  aiConfigurationError,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiProvider,
} from "./ai-types.ts";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 45_000;

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string; type?: string; code?: string };
}

/**
 * Extract a safe, short message from an upstream error body.
 *
 * Upstream bodies can echo the request, so only the first line is kept and
 * any long token is truncated. Anything that looks like a credential is
 * redacted outright, so an upstream error can never leak a key into a
 * response body or a log line.
 */
function safeUpstreamMessage(body: string): string {
  const firstLine = body.split("\n")[0]?.trim() ?? "";
  const redacted = firstLine
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "[redacted key]");
  return redacted.length > 200
    ? `${redacted.slice(0, 200)}…`
    : redacted || "The provider returned an error.";
}

export class OpenAiProvider implements AiProvider {
  readonly id = "openai";
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: { apiKey: string; baseUrl?: string; model?: string }) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.model = options.model ?? DEFAULT_MODEL;
  }

  get available(): boolean {
    return this.apiKey.length > 0;
  }

  async completeJson(
    request: AiCompletionRequest,
  ): Promise<AiCompletionResult> {
    const startedAt = Date.now();
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        throw new AiError(
          "TIMEOUT",
          `The provider did not respond within ${Math.round(timeoutMs / 1000)}s.`,
        );
      }
      throw new AiError(
        "UPSTREAM_ERROR",
        "The provider could not be reached. Check the network connection and try again.",
      );
    } finally {
      clearTimeout(timer);
    }

    const rawBody = await response.text();

    if (!response.ok) {
      if (response.status === 429) {
        throw new AiError(
          "RATE_LIMITED",
          "The provider is rate limiting this workspace. Wait a moment and try again.",
        );
      }
      throw new AiError(
        "UPSTREAM_ERROR",
        `The provider returned an error (${response.status}). ${safeUpstreamMessage(rawBody)}`,
      );
    }

    let parsed: ChatCompletionResponse;
    try {
      parsed = JSON.parse(rawBody) as ChatCompletionResponse;
    } catch {
      throw new AiError(
        "MALFORMED_OUTPUT",
        "The provider returned a response that could not be read.",
      );
    }

    if (parsed.error) {
      throw new AiError(
        "UPSTREAM_ERROR",
        `The provider returned an error. ${safeUpstreamMessage(parsed.error.message ?? "")}`,
      );
    }

    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new AiError(
        "MALFORMED_OUTPUT",
        "The provider returned an empty response.",
      );
    }

    return {
      data: parseJsonObject(content),
      provider: this.id,
      model: this.model,
      durationMs: Date.now() - startedAt,
    };
  }
}

/**
 * Parse a model response into a JSON object.
 *
 * Models occasionally wrap JSON in a code fence or add a sentence around it.
 * This recovers the object without guessing: if a fenced block is present it
 * is used, otherwise the outermost braces are located. If nothing parses, the
 * caller receives a `MALFORMED_OUTPUT` error rather than a fabricated value.
 */
export function parseJsonObject(content: string): Record<string, unknown> {
  const candidates: string[] = [];

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1]);

  candidates.push(content);

  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(content.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate.trim()) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    } catch {
      // Try the next candidate.
    }
  }

  throw new AiError(
    "MALFORMED_OUTPUT",
    "The provider did not return usable JSON. Try again, or record the result by hand.",
  );
}

/**
 * Build the provider from the environment.
 *
 * Returns `null` when the provider is not configured, so the caller can
 * report an explicit configuration error instead of failing obscurely.
 */
export function createAiProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AiProvider | null {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  return new OpenAiProvider({
    apiKey,
    baseUrl: env.OPENAI_BASE_URL?.trim() || undefined,
    model: env.OPENAI_MODEL?.trim() || undefined,
  });
}

/** The env var names the AI provider needs, for error messages and docs. */
export const AI_PROVIDER_ENV_VARS = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
] as const;

/** Describe why the provider cannot run, without revealing any value. */
export function describeMissingConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const missing: string[] = [];
  if (!env.OPENAI_API_KEY?.trim()) missing.push("OPENAI_API_KEY");
  return missing;
}

/** Convenience: throw the shared configuration error when unconfigured. */
export function requireAiProvider(
  env: NodeJS.ProcessEnv = process.env,
): AiProvider {
  const provider = createAiProviderFromEnv(env);
  if (provider) return provider;
  throw aiConfigurationError(describeMissingConfiguration(env));
}
