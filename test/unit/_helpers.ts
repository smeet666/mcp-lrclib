import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Config } from "../../src/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "fixtures");

/** The address a fetch was called with, whichever of the three shapes it took. */
function addressOf(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return String((input as { url?: unknown }).url);
}

export function fixtureText(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

export function fixture<T = unknown>(name: string): T {
  return JSON.parse(fixtureText(name)) as T;
}

export interface RawRow {
  id: number;
  name: string;
  trackName: string;
  artistName: string;
  albumName: string | null;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
  lyricsfile?: string | null;
}

/**
 * A configuration with pacing and caching neutralised, so a test exercises the
 * behaviour under test instead of waiting on the politeness delay.
 */
export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    userAgent: "mcp-lrclib-test",
    minIntervalMs: 0,
    timeoutMs: 1_000,
    maxRetries: 0,
    cacheTtlMs: 0,
    cacheMaxEntries: 0,
    logLevel: "silent",
    ...overrides,
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export interface FetchStub {
  impl: typeof fetch;
  calls: string[];
}

export function makeFetch(
  handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
): FetchStub {
  const calls: string[] = [];
  const impl = (async (input: unknown, init?: RequestInit) => {
    const url = addressOf(input);
    calls.push(url);
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

/** Routes the standard fixtures onto the three LRCLIB endpoints. */
export function fixtureRouter(
  options: {
    search?: unknown;
    byId?: Record<string, unknown>;
    exact?: unknown;
    exactStatus?: number;
  } = {},
): FetchStub {
  return makeFetch((url) => {
    if (url.includes("/api/search")) {
      return jsonResponse(options.search ?? fixture("search-results.json"));
    }
    const byIdMatch = /\/api\/get\/(\d+)/.exec(url);
    if (byIdMatch) {
      const id = byIdMatch[1] as string;
      const body = options.byId?.[id];
      if (body === undefined) {
        return jsonResponse(fixture("error-not-found.json"), 404);
      }
      return jsonResponse(body);
    }
    if (url.includes("/api/get")) {
      const status = options.exactStatus ?? 200;
      if (status !== 200) {
        return jsonResponse(fixture("error-not-found.json"), status);
      }
      return jsonResponse(options.exact ?? fixture("track-with-both.json"));
    }
    throw new Error(`unexpected url in test: ${url}`);
  });
}

/** Every lyric body carried by a fixture, for leak detection. */
export function lyricBodies(rows: RawRow[]): string[] {
  const out: string[] = [];
  for (const row of rows) {
    if (typeof row.plainLyrics === "string" && row.plainLyrics.length > 0) {
      out.push(row.plainLyrics);
    }
    if (typeof row.syncedLyrics === "string" && row.syncedLyrics.length > 0) {
      out.push(row.syncedLyrics);
    }
  }
  return out;
}
