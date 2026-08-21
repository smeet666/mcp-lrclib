/**
 * Error taxonomy surfaced to the calling model.
 *
 * LRCLIB returns structured errors, for example
 * `{"message":"Failed to find specified track","name":"TrackNotFound","statusCode":404}`,
 * so the mapping here is a translation rather than a guess.
 */

export type ErrorCode =
  | "not_found"
  | "invalid_input"
  | "rate_limited"
  | "upstream_error"
  | "network_error"
  | "timeout";

export interface ErrorDetails {
  url?: string;
  status?: number;
  retryAfterMs?: number;
  hint?: string;
}

export class LrclibError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: ErrorDetails = {},
  ) {
    super(message);
    this.name = "LrclibError";
  }
}

const ISSUES_URL = "https://github.com/smeet666/mcp-lrclib/issues";

export function trackNotFound(url: string, what: string): LrclibError {
  return new LrclibError("not_found", `LRCLIB has no track matching ${what}.`, {
    url,
    status: 404,
    hint:
      "LRCLIB matches artist and title exactly. Use search_tracks to find the exact spelling " +
      "LRCLIB uses, then call this tool again with the id it returned.",
  });
}

export function invalidInput(message: string, hint?: string): LrclibError {
  return new LrclibError("invalid_input", message, hint ? { hint } : {});
}

export function rateLimited(url: string, retryAfterMs: number): LrclibError {
  return new LrclibError("rate_limited", "LRCLIB is rate limiting this client.", {
    url,
    status: 429,
    retryAfterMs,
    hint:
      `Wait about ${Math.ceil(retryAfterMs / 1000)} seconds and try the same call again. ` +
      "If it keeps happening, raise LRCLIB_MIN_INTERVAL_MS in your MCP client configuration.",
  });
}

export function upstreamError(url: string, status: number, message?: string): LrclibError {
  return new LrclibError(
    "upstream_error",
    `LRCLIB returned HTTP ${status}${message ? `: ${message}` : "."}`,
    {
      url,
      status,
      hint: status >= 500 ? "This is a problem on LRCLIB's side. Try again shortly." : undefined,
    },
  );
}

export function malformedResponse(url: string): LrclibError {
  return new LrclibError(
    "upstream_error",
    "LRCLIB returned a response this client could not read. Its API may have changed.",
    { url, hint: `Please report this at ${ISSUES_URL}` },
  );
}
