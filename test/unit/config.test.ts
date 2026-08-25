import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULTS,
  DEFAULT_USER_AGENT,
  MIN_ALLOWED_INTERVAL_MS,
  createLogger,
  loadConfig,
} from "../../src/config.js";
import { PKG_VERSION, REPO_URL } from "../../src/version.js";

/** Collects everything a call writes to stderr, whichever channel it uses. */
function captureStderr(): { lines: () => string; restore: () => void } {
  const chunks: string[] = [];
  const writeSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: unknown): boolean => {
      chunks.push(String(chunk));
      return true;
    });
  const consoleSpies = (["error", "warn", "info", "debug", "log"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      chunks.push(args.map(String).join(" "));
    }),
  );
  return {
    lines: () => chunks.join("\n"),
    restore: () => {
      writeSpy.mockRestore();
      for (const spy of consoleSpies) {
        spy.mockRestore();
      }
    },
  };
}

describe("loadConfig", () => {
  it("falls back to every default on an empty environment", () => {
    const config = loadConfig({});
    expect(config).toEqual({
      userAgent: DEFAULT_USER_AGENT,
      minIntervalMs: DEFAULTS.minIntervalMs,
      timeoutMs: DEFAULTS.timeoutMs,
      maxRetries: DEFAULTS.maxRetries,
      cacheTtlMs: DEFAULTS.cacheTtlMs,
      cacheMaxEntries: DEFAULTS.cacheMaxEntries,
      logLevel: DEFAULTS.logLevel,
    });
  });

  it("does not read process.env when an explicit environment is passed", () => {
    const previous = process.env.LRCLIB_USER_AGENT;
    process.env.LRCLIB_USER_AGENT = "leaked-from-process-env";
    try {
      expect(loadConfig({}).userAgent).toBe(DEFAULT_USER_AGENT);
    } finally {
      if (previous === undefined) {
        delete process.env.LRCLIB_USER_AGENT;
      } else {
        process.env.LRCLIB_USER_AGENT = previous;
      }
    }
  });

  it("reads every documented variable", () => {
    const config = loadConfig({
      LRCLIB_USER_AGENT: "my-agent/1.0 (mailto:me@example.com)",
      LRCLIB_MIN_INTERVAL_MS: "750",
      LRCLIB_TIMEOUT_MS: "2500",
      LRCLIB_MAX_RETRIES: "5",
      LRCLIB_CACHE_TTL_MS: "1000",
      LRCLIB_CACHE_MAX_ENTRIES: "7",
      LRCLIB_LOG_LEVEL: "debug",
    });
    expect(config).toEqual({
      userAgent: "my-agent/1.0 (mailto:me@example.com)",
      minIntervalMs: 750,
      timeoutMs: 2500,
      maxRetries: 5,
      cacheTtlMs: 1000,
      cacheMaxEntries: 7,
      logLevel: "debug",
    });
  });

  it("accepts every valid log level", () => {
    for (const level of ["silent", "error", "info", "debug"] as const) {
      expect(loadConfig({ LRCLIB_LOG_LEVEL: level }).logLevel).toBe(level);
    }
  });

  it("rejects an unknown log level and keeps the default", () => {
    expect(loadConfig({ LRCLIB_LOG_LEVEL: "verbose" }).logLevel).toBe(DEFAULTS.logLevel);
    expect(loadConfig({ LRCLIB_LOG_LEVEL: "ERROR" }).logLevel).toBe(DEFAULTS.logLevel);
  });

  describe("the 200 ms floor on the request interval", () => {
    it("exports the floor as 200", () => {
      expect(MIN_ALLOWED_INTERVAL_MS).toBe(200);
    });

    it("ignores a value below the floor and uses the default, not the floor", () => {
      const config = loadConfig({ LRCLIB_MIN_INTERVAL_MS: "50" });
      expect(config.minIntervalMs).toBe(DEFAULTS.minIntervalMs);
      expect(config.minIntervalMs).not.toBe(MIN_ALLOWED_INTERVAL_MS);
    });

    it("ignores zero and negative intervals", () => {
      expect(loadConfig({ LRCLIB_MIN_INTERVAL_MS: "0" }).minIntervalMs).toBe(
        DEFAULTS.minIntervalMs,
      );
      expect(loadConfig({ LRCLIB_MIN_INTERVAL_MS: "-1000" }).minIntervalMs).toBe(
        DEFAULTS.minIntervalMs,
      );
    });

    it("accepts exactly the floor", () => {
      expect(
        loadConfig({ LRCLIB_MIN_INTERVAL_MS: String(MIN_ALLOWED_INTERVAL_MS) }).minIntervalMs,
      ).toBe(MIN_ALLOWED_INTERVAL_MS);
    });

    it("accepts an interval slower than the default", () => {
      expect(loadConfig({ LRCLIB_MIN_INTERVAL_MS: "5000" }).minIntervalMs).toBe(5000);
    });
  });

  describe("garbage values", () => {
    const garbage = [
      "abc",
      "",
      "   ",
      "NaN",
      "Infinity",
      "-Infinity",
      "null",
      "undefined",
      "12abc",
      "{}",
      "1,5",
    ];

    it("never throws, whatever the environment holds", () => {
      const capture = captureStderr();
      try {
        for (const value of garbage) {
          expect(() =>
            loadConfig({
              LRCLIB_MIN_INTERVAL_MS: value,
              LRCLIB_TIMEOUT_MS: value,
              LRCLIB_MAX_RETRIES: value,
              LRCLIB_CACHE_TTL_MS: value,
              LRCLIB_CACHE_MAX_ENTRIES: value,
              LRCLIB_LOG_LEVEL: value,
              LRCLIB_USER_AGENT: value,
            }),
          ).not.toThrow();
        }
      } finally {
        capture.restore();
      }
    });

    it("falls back to defaults for unparseable numbers", () => {
      const capture = captureStderr();
      try {
        for (const value of garbage) {
          const config = loadConfig({
            LRCLIB_MIN_INTERVAL_MS: value,
            LRCLIB_TIMEOUT_MS: value,
            LRCLIB_MAX_RETRIES: value,
            LRCLIB_CACHE_TTL_MS: value,
            LRCLIB_CACHE_MAX_ENTRIES: value,
          });
          expect({ value, ...config }).toMatchObject({
            minIntervalMs: DEFAULTS.minIntervalMs,
            timeoutMs: DEFAULTS.timeoutMs,
            maxRetries: DEFAULTS.maxRetries,
            cacheTtlMs: DEFAULTS.cacheTtlMs,
            cacheMaxEntries: DEFAULTS.cacheMaxEntries,
          });
        }
      } finally {
        capture.restore();
      }
    });

    it("warns on stderr when a value is rejected", () => {
      const capture = captureStderr();
      let output: string;
      try {
        loadConfig({ LRCLIB_TIMEOUT_MS: "not-a-number" });
        output = capture.lines();
      } finally {
        capture.restore();
      }
      expect(output).not.toBe("");
      expect(output).toMatch(/LRCLIB_TIMEOUT_MS/);
    });

    it("stays silent when every value is valid", () => {
      const capture = captureStderr();
      let output: string;
      try {
        loadConfig({ LRCLIB_TIMEOUT_MS: "3000", LRCLIB_LOG_LEVEL: "info" });
        output = capture.lines();
      } finally {
        capture.restore();
      }
      expect(output).toBe("");
    });

    it("ignores a blank user agent", () => {
      const capture = captureStderr();
      try {
        expect(loadConfig({ LRCLIB_USER_AGENT: "" }).userAgent).toBe(DEFAULT_USER_AGENT);
        expect(loadConfig({ LRCLIB_USER_AGENT: "   " }).userAgent).toBe(DEFAULT_USER_AGENT);
      } finally {
        capture.restore();
      }
    });

    it("rejects a negative timeout", () => {
      const capture = captureStderr();
      try {
        expect(loadConfig({ LRCLIB_TIMEOUT_MS: "-1" }).timeoutMs).toBe(DEFAULTS.timeoutMs);
      } finally {
        capture.restore();
      }
    });

    it("rejects a negative retry count", () => {
      const capture = captureStderr();
      try {
        expect(loadConfig({ LRCLIB_MAX_RETRIES: "-1" }).maxRetries).toBe(DEFAULTS.maxRetries);
      } finally {
        capture.restore();
      }
    });

    it("rejects a negative cache TTL and size", () => {
      const capture = captureStderr();
      try {
        expect(loadConfig({ LRCLIB_CACHE_TTL_MS: "-1" }).cacheTtlMs).toBe(DEFAULTS.cacheTtlMs);
        expect(loadConfig({ LRCLIB_CACHE_MAX_ENTRIES: "-1" }).cacheMaxEntries).toBe(
          DEFAULTS.cacheMaxEntries,
        );
      } finally {
        capture.restore();
      }
    });
  });

  describe("zero as a meaningful value", () => {
    it("lets the cache be switched off with a zero TTL or size", () => {
      const capture = captureStderr();
      try {
        expect(loadConfig({ LRCLIB_CACHE_TTL_MS: "0" }).cacheTtlMs).toBe(0);
        expect(loadConfig({ LRCLIB_CACHE_MAX_ENTRIES: "0" }).cacheMaxEntries).toBe(0);
      } finally {
        capture.restore();
      }
    });

    it("lets retries be switched off with zero", () => {
      const capture = captureStderr();
      try {
        expect(loadConfig({ LRCLIB_MAX_RETRIES: "0" }).maxRetries).toBe(0);
      } finally {
        capture.restore();
      }
    });
  });
});

describe("DEFAULT_USER_AGENT", () => {
  it("follows the name/version/url format LRCLIB asks for", () => {
    expect(DEFAULT_USER_AGENT).toBe(`mcp-lrclib v${PKG_VERSION} (${REPO_URL})`);
    expect(DEFAULT_USER_AGENT).toMatch(/^mcp-lrclib v\d+\.\d+\.\d+ \(https:\/\/\S+\)$/);
  });
});

describe("createLogger", () => {
  let capture: ReturnType<typeof captureStderr>;

  beforeEach(() => {
    capture = captureStderr();
  });

  afterEach(() => {
    capture.restore();
  });

  function callEveryMethod(logger: object, message: string): void {
    for (const key of Object.keys(logger)) {
      const value = (logger as Record<string, unknown>)[key];
      if (typeof value === "function") {
        (value as (...args: unknown[]) => unknown)(message);
      }
    }
  }

  it("writes nothing at all when silent", () => {
    callEveryMethod(createLogger("silent"), "should-not-appear");
    expect(capture.lines()).toBe("");
  });

  it("writes to stderr at debug level", () => {
    callEveryMethod(createLogger("debug"), "hello-from-debug");
    expect(capture.lines()).toContain("hello-from-debug");
  });

  it("keeps quieter levels quieter than louder ones", () => {
    callEveryMethod(createLogger("error"), "x");
    const atError = capture.lines().length;
    capture.restore();
    capture = captureStderr();
    callEveryMethod(createLogger("debug"), "x");
    const atDebug = capture.lines().length;
    expect(atDebug).toBeGreaterThan(atError);
  });

  it("never writes to stdout, which carries the MCP protocol", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      callEveryMethod(createLogger("debug"), "hello");
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});
