/**
 * HTTP layer: one JSON GET, with backoff.
 *
 * LRCLIB answers with proper status codes and a structured error body, so this
 * layer only has to translate them. That is the main simplification over a
 * scraping client, where a failure can arrive disguised as a normal page.
 */

import type { Config, Logger } from "../config.js";
import { LrclibError, rateLimited, upstreamError } from "../errors.js";
import { toApiError } from "./responses.js";
import { RateLimiter, sleep } from "./rateLimiter.js";

const BACKOFF_BASE_MS = 1000;
const BACKOFF_FACTOR = 2;
const BACKOFF_MAX_MS = 15_000;

/** Exponential backoff with jitter, so parallel clients do not resynchronise. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const capped = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * BACKOFF_FACTOR ** attempt);
  return Math.round(capped * (0.5 + random() * 0.5));
}

export interface HttpDeps {
  config: Config;
  limiter: RateLimiter;
  logger: Logger;
  fetchImpl?: typeof fetch;
}

export interface JsonResponse {
  status: number;
  /** Parsed body, or undefined for 404 responses with an empty body. */
  body: unknown;
}

/**
 * Fetch one endpoint as JSON.
 *
 * A 404 is returned to the caller rather than thrown: for `/api/get` it means
 * "no such track", which each tool phrases in its own terms. The retry loop and
 * its sleeps run inside a single limiter slot, so a queued request cannot slip
 * into the window the current one is backing away from.
 */
export async function fetchJson(url: string, deps: HttpDeps): Promise<JsonResponse> {
  const { config, limiter, logger } = deps;
  const doFetch = deps.fetchImpl ?? fetch;

  return limiter.schedule(async () => {
    let lastError: LrclibError | undefined;

    // Set when the site says how long to stay away; it replaces our own guess
    // for the next attempt. Applied here rather than where it is read, so no
    // wait is ever served after the last attempt, when nobody would use it.
    let askedWaitMs: number | null = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
      if (attempt > 0) {
        const delay = Math.min(askedWaitMs ?? backoffDelay(attempt - 1), BACKOFF_MAX_MS);
        askedWaitMs = null;
        logger.info(`retry ${attempt}/${config.maxRetries} in ${delay}ms for ${url}`);
        await sleep(delay);
      }

      let status: number;
      let text: string;
      let retryAfterMs: number | null = null;
      try {
        await limiter.beforeRequest();
        const response = await doFetch(url, {
          headers: {
            "User-Agent": config.userAgent,
            Accept: "application/json",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(config.timeoutMs),
        });
        status = response.status;
        retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
        text = await response.text();
      } catch (error) {
        lastError = asTransportError(error, url);
        logger.debug(`${lastError.code} for ${url}: ${lastError.message}`);
        continue;
      }

      if (status === 429 || status === 403) {
        limiter.penalize();
        // A server that says when to come back knows better than our own guess.
        askedWaitMs = retryAfterMs;
        lastError = rateLimited(url, retryAfterMs ?? backoffDelay(attempt));
        logger.info(
          `refused on ${url} with ${status}, interval now ${limiter.currentIntervalMs}ms`,
        );
        continue;
      }

      if (status >= 500) {
        lastError = upstreamError(url, status);
        continue;
      }

      limiter.relax();
      const body = parseBody(text);

      if (status === 404) return { status, body };
      if (status >= 400) {
        const apiError = toApiError(body);
        throw upstreamError(url, status, apiError?.message);
      }

      return { status, body };
    }

    throw lastError ?? new LrclibError("network_error", `Could not fetch ${url}.`, { url });
  });
}

/** LRCLIB sends an empty body on some 404s, which is not an error to report. */
function parseBody(text: string): unknown {
  if (text.trim() === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** `Retry-After` carries either seconds or an HTTP date. */
function parseRetryAfter(raw: string | null): number | null {
  if (!raw) return null;
  const seconds = Number(raw.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const when = Date.parse(raw);
  if (Number.isNaN(when)) return null;
  return Math.max(0, when - Date.now());
}

function asTransportError(error: unknown, url: string): LrclibError {
  if (error instanceof LrclibError) return error;
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return new LrclibError("timeout", "LRCLIB did not answer in time.", {
      url,
      hint: "Raise LRCLIB_TIMEOUT_MS if this happens often on a slow connection.",
    });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new LrclibError("network_error", `Could not reach LRCLIB: ${message}`, { url });
}
