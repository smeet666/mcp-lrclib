import { describe, expect, it } from "vitest";
import { LrclibClient } from "../../src/lrclib/client.js";
import { LrclibError } from "../../src/errors.js";
import { createLogger } from "../../src/config.js";
import {
  fixture,
  jsonResponse,
  lyricBodies,
  makeFetch,
  testConfig,
  type RawRow,
} from "./_helpers.js";

const logger = createLogger("silent");

function clientWith(fetchImpl: typeof fetch, config = testConfig()): LrclibClient {
  return new LrclibClient({ config, logger, fetchImpl });
}

async function expectLrclibError(promise: Promise<unknown>, code: string): Promise<LrclibError> {
  try {
    await promise;
    expect.unreachable(`expected a LrclibError with code ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(LrclibError);
    expect((error as LrclibError).code).toBe(code);
    return error as LrclibError;
  }
  throw new Error("unreachable");
}

describe("LrclibClient.search", () => {
  it("returns metadata only, with no lyric text at all", async () => {
    const rows = fixture<RawRow[]>("search-results.json");
    const stub = makeFetch(() => jsonResponse(rows));
    const { data, cached } = await clientWith(stub.impl).search({ q: "placeholder" });

    expect(cached).toBe(false);
    expect(data).toHaveLength(20);
    const serialized = JSON.stringify(data);
    for (const body of lyricBodies(rows)) {
      expect(serialized).not.toContain(body.slice(0, 25));
    }
    expect(serialized).not.toContain("Placeholder line");
    expect(data[0]).toMatchObject({ hasPlainLyrics: true, hasSyncedLyrics: true });
  });

  it("calls the search endpoint with the free-text query", async () => {
    const stub = makeFetch(() => jsonResponse([]));
    await clientWith(stub.impl).search({ q: "sexy boy" });
    expect(stub.calls).toHaveLength(1);
    const url = new URL(stub.calls[0] as string);
    expect(url.pathname).toBe("/api/search");
    expect(url.searchParams.get("q")).toBe("sexy boy");
  });

  it("sends the configured user agent", async () => {
    const seen: (RequestInit | undefined)[] = [];
    const stub = makeFetch((_url, init) => {
      seen.push(init);
      return jsonResponse([]);
    });
    await clientWith(stub.impl, testConfig({ userAgent: "agent-under-test" })).search({ q: "a" });
    const headers = new Headers((seen[0]?.headers ?? {}) as Record<string, string>);
    expect(headers.get("user-agent")).toBe("agent-under-test");
  });

  it("returns an empty list rather than an error when nothing matches", async () => {
    const stub = makeFetch(() => jsonResponse(fixture("search-empty.json")));
    const { data } = await clientWith(stub.impl).search({ q: "nothing at all" });
    expect(data).toEqual([]);
  });

  it("skips rows LRCLIB serves broken", async () => {
    const stub = makeFetch(() => jsonResponse(fixture("search-with-broken-row.json")));
    const { data } = await clientWith(stub.impl).search({ q: "placeholder" });
    expect(data).toHaveLength(2);
  });

  it("fails on a payload that is not an array", async () => {
    const stub = makeFetch(() => jsonResponse({ oops: true }));
    await expectLrclibError(clientWith(stub.impl).search({ q: "a" }), "upstream_error");
  });
});

describe("LrclibClient.get", () => {
  it("returns the track with its lyrics", async () => {
    const track = fixture<RawRow>("track-with-both.json");
    const stub = makeFetch(() => jsonResponse(track));
    const { data } = await clientWith(stub.impl).get({
      artistName: "Placeholder Artist 1",
      trackName: "Placeholder Track 1",
    });
    expect(data.plainLyrics).toBe(track.plainLyrics);
    expect(data.syncedLyrics).toBe(track.syncedLyrics);
    expect(data.id).toBe(35670801);
  });

  it("passes album and duration through to the endpoint", async () => {
    const stub = makeFetch(() => jsonResponse(fixture("track-with-both.json")));
    await clientWith(stub.impl).get({
      artistName: "Air",
      trackName: "Sexy Boy",
      albumName: "Moon Safari",
      durationSeconds: 296,
    });
    const url = new URL(stub.calls[0] as string);
    expect(url.pathname).toBe("/api/get");
    expect(url.searchParams.get("album_name")).toBe("Moon Safari");
    expect(url.searchParams.get("duration")).toBe("296");
  });

  it("maps a 404 to not_found", async () => {
    const stub = makeFetch(() => jsonResponse(fixture("error-not-found.json"), 404));
    const error = await expectLrclibError(
      clientWith(stub.impl).get({ artistName: "Nobody", trackName: "Nothing" }),
      "not_found",
    );
    expect(error.details.url).toContain("/api/get");
  });

  it("maps a 404 with an empty body to not_found as well", async () => {
    const stub = makeFetch(() => new Response("", { status: 404 }));
    await expectLrclibError(
      clientWith(stub.impl).get({ artistName: "Nobody", trackName: "Nothing" }),
      "not_found",
    );
  });

  it("does not retry a 404", async () => {
    const stub = makeFetch(() => jsonResponse(fixture("error-not-found.json"), 404));
    await expectLrclibError(
      clientWith(stub.impl, testConfig({ maxRetries: 3 })).get({
        artistName: "Nobody",
        trackName: "Nothing",
      }),
      "not_found",
    );
    expect(stub.calls).toHaveLength(1);
  });
});

describe("LrclibClient.getById", () => {
  it("fetches by id and returns the lyrics", async () => {
    const stub = makeFetch(() => jsonResponse(fixture("track-plain-only.json")));
    const { data } = await clientWith(stub.impl).getById(35670802);
    expect(new URL(stub.calls[0] as string).pathname).toBe("/api/get/35670802");
    expect(data.hasPlainLyrics).toBe(true);
    expect(data.hasSyncedLyrics).toBe(false);
  });

  it("maps an unknown id to not_found", async () => {
    const stub = makeFetch(() => jsonResponse(fixture("error-not-found.json"), 404));
    await expectLrclibError(clientWith(stub.impl).getById(1), "not_found");
  });
});

describe("error mapping", () => {
  it("maps 429 to rate_limited", async () => {
    const stub = makeFetch(() => new Response("slow down", { status: 429 }));
    await expectLrclibError(clientWith(stub.impl).search({ q: "a" }), "rate_limited");
  });

  it("maps 500 to upstream_error", async () => {
    const stub = makeFetch(() => new Response("nope", { status: 500 }));
    const error = await expectLrclibError(
      clientWith(stub.impl).search({ q: "a" }),
      "upstream_error",
    );
    expect(error.details.status).toBe(500);
  });

  it("maps a transport failure to network_error", async () => {
    const stub = makeFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expectLrclibError(clientWith(stub.impl).search({ q: "a" }), "network_error");
  });

  it("maps an unparseable body to an error rather than returning junk", async () => {
    const stub = makeFetch(
      () => new Response("<html>down for maintenance</html>", { status: 200 }),
    );
    const error = await expectLrclibError(
      clientWith(stub.impl).search({ q: "a" }),
      "upstream_error",
    );
    expect(error.message).not.toBe("");
  });

  it("times out a request that never answers", async () => {
    const stub = makeFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            return;
          }
          signal.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    await expectLrclibError(
      clientWith(stub.impl, testConfig({ timeoutMs: 20 })).search({ q: "a" }),
      "timeout",
    );
  });

  it("retries a server error up to the configured number of times", async () => {
    let calls = 0;
    const stub = makeFetch(() => {
      calls += 1;
      if (calls <= 2) {
        return new Response("boom", { status: 503 });
      }
      return jsonResponse([]);
    });
    const { data } = await clientWith(
      stub.impl,
      testConfig({ maxRetries: 3, timeoutMs: 5000 }),
    ).search({ q: "a" });
    expect(data).toEqual([]);
    expect(calls).toBe(3);
  });

  it("gives up after the configured number of retries", async () => {
    const stub = makeFetch(() => new Response("boom", { status: 503 }));
    await expectLrclibError(
      clientWith(stub.impl, testConfig({ maxRetries: 1, timeoutMs: 5000 })).search({ q: "a" }),
      "upstream_error",
    );
    expect(stub.calls.length).toBeLessThanOrEqual(2);
    expect(stub.calls.length).toBeGreaterThan(1);
  });
});

describe("caching", () => {
  const cachedConfig = testConfig({ cacheTtlMs: 60_000, cacheMaxEntries: 10 });

  it("serves a repeated identical search from memory", async () => {
    const stub = makeFetch(() => jsonResponse(fixture("search-results.json")));
    const client = clientWith(stub.impl, cachedConfig);
    const first = await client.search({ q: "placeholder" });
    const second = await client.search({ q: "placeholder" });
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(stub.calls).toHaveLength(1);
    expect(second.data).toEqual(first.data);
  });

  it("does not confuse two different queries", async () => {
    const stub = makeFetch((url) =>
      jsonResponse(url.includes("one") ? fixture("search-results.json") : []),
    );
    const client = clientWith(stub.impl, cachedConfig);
    const one = await client.search({ q: "one" });
    const two = await client.search({ q: "two" });
    expect(one.data.length).toBe(20);
    expect(two.data).toEqual([]);
    expect(stub.calls).toHaveLength(2);
  });

  it("caches a lookup by id separately from a lookup by name", async () => {
    const stub = makeFetch(() => jsonResponse(fixture("track-with-both.json")));
    const client = clientWith(stub.impl, cachedConfig);
    await client.getById(35670801);
    const byName = await client.get({
      artistName: "Placeholder Artist 1",
      trackName: "Placeholder Track 1",
    });
    expect(byName.cached).toBe(false);
    expect(stub.calls).toHaveLength(2);
  });

  it("does not cache a failure", async () => {
    let calls = 0;
    const stub = makeFetch(() => {
      calls += 1;
      return calls === 1
        ? jsonResponse(fixture("error-not-found.json"), 404)
        : jsonResponse(fixture("track-with-both.json"));
    });
    const client = clientWith(stub.impl, cachedConfig);
    await expectLrclibError(client.getById(35670801), "not_found");
    const retry = await client.getById(35670801);
    expect(retry.data.id).toBe(35670801);
    expect(calls).toBe(2);
  });

  it("hits the network every time when caching is switched off", async () => {
    const stub = makeFetch(() => jsonResponse([]));
    const client = clientWith(stub.impl, testConfig({ cacheTtlMs: 0, cacheMaxEntries: 0 }));
    await client.search({ q: "a" });
    await client.search({ q: "a" });
    expect(stub.calls).toHaveLength(2);
  });

  it("never lets a cached search carry lyrics back to the caller", async () => {
    const rows = fixture<RawRow[]>("search-results.json");
    const stub = makeFetch(() => jsonResponse(rows));
    const client = clientWith(stub.impl, cachedConfig);
    await client.search({ q: "placeholder" });
    const second = await client.search({ q: "placeholder" });
    expect(second.cached).toBe(true);
    const serialized = JSON.stringify(second.data);
    expect(serialized).not.toContain("Placeholder line");
    expect(serialized).not.toContain("[00:");
  });
});
