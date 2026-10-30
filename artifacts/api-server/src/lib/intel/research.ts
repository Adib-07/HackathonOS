/**
 * Research providers.
 *
 * These are real, public, documented APIs that need no credentials:
 *
 *   Wikipedia  - the MediaWiki search and summary endpoints
 *   arXiv      - the Atom query endpoint
 *   GitHub     - the repository search endpoint
 *
 * Every provider returns the same shape, and every result carries the URL it
 * came from and when it was retrieved. Nothing is invented: if a provider
 * cannot be reached, that is reported as a failure for that provider rather
 * than being papered over with plausible text.
 */
import { RESEARCH_PROVIDER_LABELS, type ResearchProviderId } from "./claims.ts";

export interface ResearchResult {
  provider: ResearchProviderId;
  title: string;
  url: string;
  /** A short factual excerpt taken from the source, where the source gives one. */
  excerpt: string;
  /** Which category of research this result belongs to. */
  sourceType:
    | "EXISTING_PRODUCT"
    | "OPEN_SOURCE_REPOSITORY"
    | "TECHNICAL_APPROACH"
    | "PUBLISHED_RESEARCH"
    | "COMPETITOR"
    | "SIMILAR_PROJECT";
}

export interface ResearchProviderOutcome {
  provider: ResearchProviderId;
  ok: boolean;
  results: ResearchResult[];
  /** A short reason when the provider did not return results. */
  error?: string;
}

const USER_AGENT = "HackathonOS/1.0 (research; contact via repository)";

/** Strip the small HTML subset the Wikipedia API returns inside snippets. */
function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, ...(init.headers ?? {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Search Wikipedia. Returns encyclopaedia articles matching the query. */
export async function searchWikipedia(
  query: string,
  limit = 5,
  timeoutMs = 12_000,
): Promise<ResearchProviderOutcome> {
  const provider: ResearchProviderId = "wikipedia";
  const url =
    "https://en.wikipedia.org/w/api.php?action=query&list=search&format=json" +
    `&srlimit=${limit}&srsearch=${encodeURIComponent(query)}` +
    "&srprop=snippet";

  try {
    const response = await fetchWithTimeout(url, timeoutMs);
    if (!response.ok) {
      return {
        provider,
        ok: false,
        results: [],
        error: `Wikipedia returned ${response.status}.`,
      };
    }

    const body = (await response.json()) as {
      query?: {
        search?: Array<{ title?: string; snippet?: string; pageid?: number }>;
      };
    };

    const results = (body.query?.search ?? [])
      .filter((item) => typeof item.title === "string")
      .map((item) => ({
        provider,
        title: item.title as string,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(
          (item.title as string).replace(/ /g, "_"),
        )}`,
        excerpt: truncate(stripHtml(item.snippet ?? ""), 320),
        sourceType: "EXISTING_PRODUCT" as const,
      }));

    return { provider, ok: true, results };
  } catch (error) {
    return {
      provider,
      ok: false,
      results: [],
      error:
        error instanceof Error && error.name === "AbortError"
          ? "Wikipedia did not respond in time."
          : "Wikipedia could not be reached.",
    };
  }
}

/** Search arXiv for published research. */
export async function searchArxiv(
  query: string,
  limit = 5,
  timeoutMs = 15_000,
): Promise<ResearchProviderOutcome> {
  const provider: ResearchProviderId = "arxiv";
  const url =
    "https://export.arxiv.org/api/query" +
    `?search_query=all:${encodeURIComponent(query)}` +
    `&max_results=${limit}`;

  try {
    const response = await fetchWithTimeout(url, timeoutMs);
    if (!response.ok) {
      return {
        provider,
        ok: false,
        results: [],
        error: `arXiv returned ${response.status}.`,
      };
    }

    const body = await response.text();
    const entries = body.split("<entry>").slice(1);

    const results = entries.map((entry) => {
      const title = decodeXml(
        entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? "",
      );
      const summary = decodeXml(
        entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim() ?? "",
      );
      const link = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() ?? "";
      return {
        provider,
        title: truncate(title, 200),
        url: link,
        excerpt: truncate(summary.replace(/\s+/g, " "), 320),
        sourceType: "PUBLISHED_RESEARCH" as const,
      };
    });

    return { provider, ok: true, results };
  } catch (error) {
    return {
      provider,
      ok: false,
      results: [],
      error:
        error instanceof Error && error.name === "AbortError"
          ? "arXiv did not respond in time."
          : "arXiv could not be reached.",
    };
  }
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Search GitHub for open-source repositories. */
export async function searchGitHub(
  query: string,
  limit = 5,
  timeoutMs = 12_000,
): Promise<ResearchProviderOutcome> {
  const provider: ResearchProviderId = "github";
  const url =
    "https://api.github.com/search/repositories" +
    `?q=${encodeURIComponent(query)}&per_page=${limit}`;

  try {
    const response = await fetchWithTimeout(url, timeoutMs, {
      headers: { accept: "application/vnd.github+json" },
    });

    if (response.status === 403 || response.status === 429) {
      return {
        provider,
        ok: false,
        results: [],
        error:
          "GitHub is rate limiting this workspace. Unauthenticated search allows a small number of requests per hour.",
      };
    }
    if (!response.ok) {
      return {
        provider,
        ok: false,
        results: [],
        error: `GitHub returned ${response.status}.`,
      };
    }

    const body = (await response.json()) as {
      items?: Array<{
        full_name?: string;
        html_url?: string;
        description?: string | null;
        stargazers_count?: number;
        language?: string | null;
      }>;
    };

    const results = (body.items ?? [])
      .filter((item) => typeof item.html_url === "string")
      .map((item) => {
        const stars = item.stargazers_count ?? 0;
        const language = item.language ? ` · ${item.language}` : "";
        return {
          provider,
          title: item.full_name ?? item.html_url ?? "Repository",
          url: item.html_url as string,
          excerpt: truncate(
            `${stars} stars${language}. ${item.description ?? "No description provided."}`,
            320,
          ),
          sourceType: "OPEN_SOURCE_REPOSITORY" as const,
        };
      });

    return { provider, ok: true, results };
  } catch (error) {
    return {
      provider,
      ok: false,
      results: [],
      error:
        error instanceof Error && error.name === "AbortError"
          ? "GitHub did not respond in time."
          : "GitHub could not be reached.",
    };
  }
}

export interface ResearchSearchOptions {
  /** Which providers to query. Defaults to all of them. */
  providers?: ResearchProviderId[];
  /** Maximum results per provider. */
  limit?: number;
  /** Per-provider timeout. */
  timeoutMs?: number;
}

export interface ResearchSearchResult {
  query: string;
  /** When the search was performed. */
  retrievedAt: string;
  outcomes: ResearchProviderOutcome[];
  /** True when at least one provider returned results. */
  anyResults: boolean;
}

/**
 * Run a research query across the selected providers.
 *
 * A provider that fails does not fail the whole search: the outcome records
 * why it failed so the user can see which sources were actually consulted.
 */
export async function runResearchSearch(
  query: string,
  options: ResearchSearchOptions = {},
): Promise<ResearchSearchResult> {
  const providers =
    options.providers ?? (["wikipedia", "arxiv", "github"] as const);
  const limit = options.limit ?? 5;
  const timeoutMs = options.timeoutMs ?? 15_000;

  const settled = await Promise.all(
    providers.map(async (provider): Promise<ResearchProviderOutcome> => {
      try {
        switch (provider) {
          case "wikipedia":
            return await searchWikipedia(query, limit, timeoutMs);
          case "arxiv":
            return await searchArxiv(query, limit, timeoutMs);
          case "github":
            return await searchGitHub(query, limit, timeoutMs);
        }
      } catch {
        return {
          provider,
          ok: false,
          results: [],
          error: `${RESEARCH_PROVIDER_LABELS[provider]} could not be queried.`,
        };
      }
    }),
  );

  return {
    query,
    retrievedAt: new Date().toISOString(),
    outcomes: settled,
    anyResults: settled.some((outcome) => outcome.results.length > 0),
  };
}
