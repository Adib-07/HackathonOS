/**
 * Shared helpers for the intelligence routes.
 *
 * Ownership is checked the same way the rest of the API does it: through the
 * competition's owner id. A caller that does not own the competition gets a
 * `404`, so the existence of another owner's workspace is never revealed.
 */
import { and, eq } from "drizzle-orm";
import { competitionsTable, db } from "@workspace/db";
import type { Competition } from "@workspace/db";
import { AiError, type AiProvider } from "./ai-types.ts";
import {
  createAiProviderFromEnv,
  describeMissingConfiguration,
} from "./openai-provider.ts";

/** Load a competition the caller owns, or undefined. */
export async function findOwnedCompetition(
  competitionId: string,
  ownerId: string,
): Promise<Competition | undefined> {
  const [competition] = await db
    .select()
    .from(competitionsTable)
    .where(
      and(
        eq(competitionsTable.id, competitionId),
        eq(competitionsTable.ownerId, ownerId),
      ),
    )
    .limit(1);

  return competition;
}

/** The provider for this workspace, or null when it is not configured. */
export function currentAiProvider(): AiProvider | null {
  return createAiProviderFromEnv();
}

/**
 * A response describing an unconfigured provider.
 *
 * The message names the environment variables that are missing. It never
 * includes a value, and it never includes a key that is present.
 */
export function aiNotConfiguredResponse(): {
  status: number;
  body: { error: string; code: string; missing: string[] };
} {
  const missing = describeMissingConfiguration();
  return {
    status: 503,
    body: {
      error:
        "The AI provider is not configured for this workspace, so this step could not be generated automatically. The information you already have is still available, and you can record the result by hand.",
      code: "AI_NOT_CONFIGURED",
      missing,
    },
  };
}
/** Turn an AI failure into a response the client can act on. */
export function aiErrorResponse(error: unknown): {
  status: number;
  body: { error: string; code: string };
} {
  if (error instanceof AiError) {
    const status =
      error.kind === "NOT_CONFIGURED"
        ? 503
        : error.kind === "RATE_LIMITED"
          ? 429
          : error.kind === "TIMEOUT"
            ? 504
            : 502;
    return { status, body: { error: error.detail, code: error.kind } };
  }

  return {
    status: 500,
    body: {
      error: "The step could not be generated. Try again, or record the result by hand.",
      code: "UNKNOWN",
    },
  };
}

/** A short, safe label for a stored competition. */
export function briefFromCompetition(competition: Competition) {
  return {
    id: competition.id,
    name: competition.name,
    organizer: competition.organizer,
    competitionType: competition.competitionType,
    deadline: competition.deadline,
    startAt: competition.startAt,
    teamSize: competition.teamSize,
    teamSkills: competition.teamSkills,
    mandatoryDeliverables: competition.mandatoryDeliverables,
    currentTrack: competition.currentTrack,
    trackMode: competition.trackMode,
    problemStatement: competition.problemStatement,
    officialUrl: competition.officialUrl,
    rulesUrl: competition.rulesUrl,
    ideaComplexity: competition.ideaComplexity,
    status: competition.status,
  };
}
