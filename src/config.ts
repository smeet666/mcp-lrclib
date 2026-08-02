/**
 * Runtime configuration, read from environment variables.
 *
 * A bad value never crashes the process: an MCP server that dies at startup
 * because of a typo in a client config file is very hard to diagnose from the
 * host application, so invalid input is clamped and reported on stderr.
 */

import { PKG_VERSION, REPO_URL } from "./version.js";

export type LogLevel = "silent" | "error" | "info" | "debug";

export interface Config {
  userAgent: string;
  minIntervalMs: number;
  timeoutMs: number;
  maxRetries: number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  logLevel: LogLevel;
}

/**
 * LRCLIB asks third-party clients to identify themselves with an application
 * name, a version and a link to the project, so the default follows that format.
 */
export const DEFAULT_USER_AGENT = `mcp-lrclib v${PKG_VERSION} (${REPO_URL})`;

export const DEFAULTS = {
  minIntervalMs: 500,
  timeoutMs: 15_000,
  maxRetries: 3,
  cacheTtlMs: 15 * 60 * 1000,
  cacheMaxEntries: 200,
  logLevel: "error" as LogLevel,
};

/**
 * Floor on the request interval, enforced regardless of configuration.
 *
 * LRCLIB publishes no rate limit and asks for nothing in return for a free
 * service. Self-imposed pacing is the whole of the politeness contract here, so
 * a value below this floor is refused and the default is used instead.
 */
export const MIN_ALLOWED_INTERVAL_MS = 200;

const LOG_LEVELS: LogLevel[] = ["silent", "error", "info", "debug"];

interface NumericRange {
  min: number;
  max: number;
  fallback: number;
}

function readNumber(name: string, env: NodeJS.ProcessEnv, range: NumericRange): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return range.fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    warn(`${name}="${raw}" is not a number, using ${range.fallback}`);
    return range.fallback;
  }

  // Out-of-range values fall back to the default rather than being clamped to
  // the nearest bound. Clamping turns a typo into a silent behaviour change:
  // -1 retries becomes "never retry", and -1 cache entries disables the cache
  // outright, both of which look like working configuration.
  const rounded = Math.round(parsed);
  if (rounded < range.min || rounded > range.max) {
    warn(
      `${name}=${raw} is outside the accepted range ${range.min}-${range.max} and was ignored; ` +
        `using ${range.fallback}`,
    );
    return range.fallback;
  }
  return rounded;
}

function warn(message: string): void {
  process.stderr.write(`[mcp-lrclib] ${message}\n`);
}

/**
 * Read the request interval, refusing anything below the floor.
 *
 * A value under the floor falls back to the default rather than to the floor
 * itself: someone who set 0 was not asking for 200, they were asking for no
 * pacing at all, and the safe reading of that request is to ignore it.
 */
function readInterval(env: NodeJS.ProcessEnv): number {
  const raw = env.LRCLIB_MIN_INTERVAL_MS;
  if (raw === undefined || raw.trim() === "") return DEFAULTS.minIntervalMs;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    warn(`LRCLIB_MIN_INTERVAL_MS="${raw}" is not a number, using ${DEFAULTS.minIntervalMs}ms`);
    return DEFAULTS.minIntervalMs;
  }

  const rounded = Math.round(parsed);
  if (rounded < MIN_ALLOWED_INTERVAL_MS) {
    warn(
      `LRCLIB_MIN_INTERVAL_MS=${raw} is below the ${MIN_ALLOWED_INTERVAL_MS}ms floor and was ignored; ` +
        `using ${DEFAULTS.minIntervalMs}ms. LRCLIB is a free service, so this client paces itself.`,
    );
    return DEFAULTS.minIntervalMs;
  }

  return Math.min(60_000, rounded);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rawUserAgent = env.LRCLIB_USER_AGENT?.trim();
  const rawLogLevel = env.LRCLIB_LOG_LEVEL?.trim().toLowerCase();

  let logLevel = DEFAULTS.logLevel;
  if (rawLogLevel) {
    if (LOG_LEVELS.includes(rawLogLevel as LogLevel)) {
      logLevel = rawLogLevel as LogLevel;
    } else {
      warn(`LRCLIB_LOG_LEVEL="${rawLogLevel}" is unknown, using "${DEFAULTS.logLevel}"`);
    }
  }

  return {
    userAgent: rawUserAgent || DEFAULT_USER_AGENT,
    minIntervalMs: readInterval(env),
    timeoutMs: readNumber("LRCLIB_TIMEOUT_MS", env, {
      min: 1000,
      max: 120_000,
      fallback: DEFAULTS.timeoutMs,
    }),
    maxRetries: readNumber("LRCLIB_MAX_RETRIES", env, {
      min: 0,
      max: 10,
      fallback: DEFAULTS.maxRetries,
    }),
    cacheTtlMs: readNumber("LRCLIB_CACHE_TTL_MS", env, {
      min: 0,
      max: 24 * 60 * 60 * 1000,
      fallback: DEFAULTS.cacheTtlMs,
    }),
    cacheMaxEntries: readNumber("LRCLIB_CACHE_MAX_ENTRIES", env, {
      min: 0,
      max: 10_000,
      fallback: DEFAULTS.cacheMaxEntries,
    }),
    logLevel,
  };
}

const LEVEL_RANK: Record<LogLevel, number> = { silent: 0, error: 1, info: 2, debug: 3 };

/**
 * Logs go to stderr without exception. On a stdio transport, stdout carries the
 * protocol and any stray write there corrupts the session.
 */
export function createLogger(level: LogLevel) {
  const emit = (at: LogLevel, message: string) => {
    if (LEVEL_RANK[level] >= LEVEL_RANK[at]) {
      process.stderr.write(`[mcp-lrclib] ${message}\n`);
    }
  };
  return {
    error: (message: string) => emit("error", message),
    info: (message: string) => emit("info", message),
    debug: (message: string) => emit("debug", message),
  };
}

export type Logger = ReturnType<typeof createLogger>;
