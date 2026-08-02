import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { createLogger } from "../../src/config.js";
import {
  fixture,
  fixtureText,
  fixtureRouter,
  jsonResponse,
  lyricBodies,
  makeFetch,
  testConfig,
  type FetchStub,
  type RawRow,
} from "./_helpers.js";

const logger = createLogger("silent");

async function connect(fetchImpl: typeof fetch): Promise<Client> {
  const server = createServer({ config: testConfig(), logger, fetchImpl });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

interface ToolCallResult {
  isError?: boolean;
  content?: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  return (await client.callTool({ name, arguments: args })) as ToolCallResult;
}

function textOf(result: ToolCallResult): string {
  return (result.content ?? []).map((part) => part.text ?? "").join("\n");
}

function serialize(result: ToolCallResult): string {
  return JSON.stringify(result);
}

const searchRows = fixture<RawRow[]>("search-results.json");
const searchFixtureBytes = fixtureText("search-results.json").length;

describe("tool registration", () => {
  it("exposes exactly the three documented tools", async () => {
    const client = await connect(fixtureRouter().impl);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "get_lyrics",
      "get_track",
      "search_tracks",
    ]);
  });

  it("declares every tool read-only", async () => {
    const client = await connect(fixtureRouter().impl);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, `${tool.name} readOnlyHint`).toBe(true);
      expect(tool.annotations?.destructiveHint ?? false, `${tool.name} destructiveHint`).toBe(
        false,
      );
    }
  });

  it("describes each tool and its inputs", async () => {
    const client = await connect(fixtureRouter().impl);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description ?? "", `${tool.name} description`).not.toBe("");
      expect(tool.inputSchema.type).toBe("object");
    }
  });
});

describe("search_tracks", () => {
  it("never leaks a single character of lyric text", async () => {
    const stub = fixtureRouter();
    const client = await connect(stub.impl);
    const result = await call(client, "search_tracks", { query: "placeholder", limit: 20 });
    const serialized = serialize(result);

    for (const body of lyricBodies(searchRows)) {
      const lines = body.split("\n");
      for (const line of lines) {
        if (line.trim().length > 8) expect(serialized).not.toContain(line.trim());
      }
      expect(serialized).not.toContain(body.slice(0, 30));
    }
    expect(serialized).not.toContain("Placeholder line");
    expect(serialized).not.toMatch(/\[\d\d:\d\d[.\]]/);
    expect(serialized).not.toMatch(/"(plain_lyrics|synced_lyrics|plainLyrics|syncedLyrics)"/);
  });

  it("stays far below the size of the payload LRCLIB served", async () => {
    const stub = fixtureRouter();
    const client = await connect(stub.impl);
    const result = await call(client, "search_tracks", { query: "placeholder", limit: 20 });
    const size = serialize(result).length;
    expect(searchFixtureBytes).toBeGreaterThan(40_000);
    expect(size).toBeLessThan(12_000);
    expect(size).toBeLessThan(searchFixtureBytes / 3);
  });

  it("returns the documented result shape", async () => {
    const client = await connect(fixtureRouter().impl);
    const result = await call(client, "search_tracks", { query: "placeholder", limit: 20 });
    expect(result.isError ?? false).toBe(false);
    const structured = result.structuredContent as {
      results: Record<string, unknown>[];
      result_count: number;
      total_available: number;
      source: unknown;
      notes: unknown[];
    };
    expect(structured.result_count).toBe(structured.results.length);
    expect(structured.total_available).toBe(20);
    expect(structured.source).toBeTruthy();
    expect(Array.isArray(structured.notes)).toBe(true);
    expect(Object.keys(structured.results[0] as object).sort()).toEqual([
      "album_name",
      "artist_name",
      "duration_seconds",
      "has_plain_lyrics",
      "has_synced_lyrics",
      "id",
      "instrumental",
      "source_url",
      "track_name",
    ]);
    expect(structured.results[0]).toMatchObject({
      id: 35670801,
      track_name: "Placeholder Track 1",
      artist_name: "Placeholder Artist 1",
      album_name: "Placeholder Album 1",
      duration_seconds: 183,
      instrumental: false,
      has_plain_lyrics: true,
      has_synced_lyrics: true,
    });
    expect(String((structured.results[0] as { source_url: string }).source_url)).toContain(
      "lrclib.net",
    );
  });

  it("returns ten results by default and reports how many exist", async () => {
    const client = await connect(fixtureRouter().impl);
    const result = await call(client, "search_tracks", { query: "placeholder" });
    const structured = result.structuredContent as { results: unknown[]; total_available: number };
    expect(structured.results).toHaveLength(10);
    expect(structured.total_available).toBe(20);
  });

  it("honours a smaller limit", async () => {
    const client = await connect(fixtureRouter().impl);
    const result = await call(client, "search_tracks", { query: "placeholder", limit: 3 });
    expect((result.structuredContent as { results: unknown[] }).results).toHaveLength(3);
  });

  it("refuses a limit above fifty", async () => {
    const client = await connect(fixtureRouter().impl);
    const result = await call(client, "search_tracks", { query: "placeholder", limit: 51 });
    expect(result.isError).toBe(true);
  });

  it("searches by the structured fields", async () => {
    const stub = fixtureRouter();
    const client = await connect(stub.impl);
    await call(client, "search_tracks", {
      track_name: "Sexy Boy",
      artist_name: "Air",
      album_name: "Moon Safari",
    });
    const url = new URL(stub.calls[0] as string);
    expect(url.searchParams.get("track_name")).toBe("Sexy Boy");
    expect(url.searchParams.get("artist_name")).toBe("Air");
    expect(url.searchParams.has("q")).toBe(false);
  });

  it("rejects a call with neither a query nor a structured field", async () => {
    const stub = fixtureRouter();
    const client = await connect(stub.impl);
    const result = await call(client, "search_tracks", {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/invalid_input|query|artist/i);
    expect(stub.calls).toHaveLength(0);
  });

  it("rejects a blank query rather than searching for nothing", async () => {
    const stub = fixtureRouter();
    const client = await connect(stub.impl);
    const result = await call(client, "search_tracks", { query: "   " });
    expect(stub.calls, "a blank query must not reach LRCLIB").toHaveLength(0);
    expect(result.isError).toBe(true);
  });

  it("reports an empty result set as a success", async () => {
    const client = await connect(fixtureRouter({ search: [] }).impl);
    const result = await call(client, "search_tracks", { query: "nothing" });
    expect(result.isError ?? false).toBe(false);
    const structured = result.structuredContent as { results: unknown[]; result_count: number };
    expect(structured.results).toEqual([]);
    expect(structured.result_count).toBe(0);
  });

  it("survives a search response containing a broken row", async () => {
    const client = await connect(
      fixtureRouter({ search: fixture("search-with-broken-row.json") }).impl,
    );
    const result = await call(client, "search_tracks", { query: "placeholder" });
    expect(result.isError ?? false).toBe(false);
    expect((result.structuredContent as { results: unknown[] }).results).toHaveLength(2);
  });
});

describe("get_lyrics", () => {
  const both = fixture<RawRow>("track-with-both.json");

  it("returns the plain lyrics by default", async () => {
    const client = await connect(fixtureRouter({ exact: both }).impl);
    const result = await call(client, "get_lyrics", {
      artist_name: "Placeholder Artist 1",
      track_name: "Placeholder Track 1",
    });
    expect(result.isError ?? false).toBe(false);
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.status).toBe("ok");
    expect(structured.plain_lyrics).toBe(both.plainLyrics);
    expect(structured.synced_lyrics ?? null).toBeNull();
    expect(structured.attribution).toBeTruthy();
    expect(structured.source).toBeTruthy();
    expect(Array.isArray(structured.notes)).toBe(true);
    expect(structured.track).toMatchObject({ id: 35670801 });
  });

  it("returns the LRC block and the parsed lines when asked for synced", async () => {
    const client = await connect(fixtureRouter({ exact: both }).impl);
    const result = await call(client, "get_lyrics", {
      artist_name: "Placeholder Artist 1",
      track_name: "Placeholder Track 1",
      format: "synced",
      max_chars: 20_000,
    });
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.synced_lyrics).toBe(both.syncedLyrics);
    const lines = structured.synced_lines as { time_seconds?: number; timeSeconds?: number }[];
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toMatchObject({});
    expect(JSON.stringify(lines[0])).toMatch(/12/);
  });

  it("bounds the parsed lines by max_chars, not by the length of the song", async () => {
    // Parsing the whole LRC block would carry every line of the track no matter
    // what max_chars said, so the response would keep growing with the song
    // while the raw text stayed bounded. The timed lines must follow the slice.
    const client = await connect(fixtureRouter({ exact: both }).impl);

    const short = await call(client, "get_lyrics", {
      artist_name: "Placeholder Artist 1",
      track_name: "Placeholder Track 1",
      format: "synced",
      max_chars: 200,
    });
    const shortBody = short.structuredContent as Record<string, unknown>;
    const shortLines = shortBody.synced_lines as unknown[];

    const full = await call(client, "get_lyrics", {
      artist_name: "Placeholder Artist 1",
      track_name: "Placeholder Track 1",
      format: "synced",
      max_chars: 20_000,
    });
    const fullBody = full.structuredContent as Record<string, unknown>;
    const fullLines = fullBody.synced_lines as unknown[];

    expect(shortBody.truncated).toBe(true);
    expect(fullBody.truncated).toBe(false);
    expect(shortLines.length).toBeGreaterThan(0);
    expect(shortLines.length).toBeLessThan(fullLines.length);

    // Every timed line must come from the slice that was actually returned.
    const returned = shortBody.synced_lyrics as string;
    for (const line of shortLines as { text: string }[]) {
      if (line.text !== "") expect(returned).toContain(line.text);
    }
  });

  it("reassembles the full timed lines across paged calls", async () => {
    const client = await connect(fixtureRouter({ exact: both }).impl);
    const collected: string[] = [];
    let offset: number | null = 0;

    while (offset !== null) {
      const page: Awaited<ReturnType<typeof call>> = await call(client, "get_lyrics", {
        artist_name: "Placeholder Artist 1",
        track_name: "Placeholder Track 1",
        format: "synced",
        max_chars: 200,
        offset,
      });
      const body = page.structuredContent as Record<string, unknown>;
      for (const line of body.synced_lines as { text: string }[]) collected.push(line.text);
      offset = body.next_offset as number | null;
    }

    const everything = await call(client, "get_lyrics", {
      artist_name: "Placeholder Artist 1",
      track_name: "Placeholder Track 1",
      format: "synced",
      max_chars: 20_000,
    });
    const allLines = (
      (everything.structuredContent as Record<string, unknown>).synced_lines as { text: string }[]
    ).map((line) => line.text);

    expect(collected).toEqual(allLines);
  });

  it("returns both bodies when asked for both", async () => {
    const client = await connect(fixtureRouter({ exact: both }).impl);
    const result = await call(client, "get_lyrics", {
      artist_name: "Placeholder Artist 1",
      track_name: "Placeholder Track 1",
      format: "both",
      max_chars: 20_000,
    });
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.plain_lyrics).toBe(both.plainLyrics);
    expect(structured.synced_lyrics).toBe(both.syncedLyrics);
  });

  it("rejects an unknown format", async () => {
    const client = await connect(fixtureRouter({ exact: both }).impl);
    const result = await call(client, "get_lyrics", {
      artist_name: "a",
      track_name: "b",
      format: "karaoke",
    });
    expect(result.isError).toBe(true);
  });

  it("fetches by id when one is given", async () => {
    const stub = fixtureRouter({ byId: { "35670801": both } });
    const client = await connect(stub.impl);
    const result = await call(client, "get_lyrics", { id: 35670801 });
    expect(result.isError ?? false).toBe(false);
    expect(new URL(stub.calls[0] as string).pathname).toBe("/api/get/35670801");
  });

  it("rejects a call with neither an id nor an artist and track", async () => {
    const stub = fixtureRouter();
    const client = await connect(stub.impl);
    const result = await call(client, "get_lyrics", {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/id|artist_name|track_name/i);
    expect(stub.calls).toHaveLength(0);
  });

  it("rejects an artist without a track", async () => {
    const stub = fixtureRouter();
    const client = await connect(stub.impl);
    const result = await call(client, "get_lyrics", { artist_name: "Air" });
    expect(result.isError).toBe(true);
    expect(stub.calls).toHaveLength(0);
  });

  describe("tracks with nothing to show", () => {
    it("treats an instrumental track as a success", async () => {
      const instrumental = fixture<RawRow>("track-instrumental.json");
      const client = await connect(fixtureRouter({ exact: instrumental }).impl);
      const result = await call(client, "get_lyrics", {
        artist_name: "Placeholder Artist 0",
        track_name: "Placeholder Track 3",
      });
      expect(result.isError ?? false).toBe(false);
      const structured = result.structuredContent as Record<string, unknown>;
      expect(structured.status).toBe("instrumental");
      expect(structured.plain_lyrics ?? null).toBeNull();
      expect(structured.synced_lyrics ?? null).toBeNull();
      expect(textOf(result)).toMatch(/instrumental/i);
    });

    it("treats a track LRCLIB holds no lyrics for as a success", async () => {
      const empty = fixture<RawRow>("track-no-lyrics.json");
      const client = await connect(fixtureRouter({ exact: empty }).impl);
      const result = await call(client, "get_lyrics", {
        artist_name: "Placeholder Artist 1",
        track_name: "Placeholder Track 4",
      });
      expect(result.isError ?? false).toBe(false);
      expect((result.structuredContent as Record<string, unknown>).status).toBe("no_lyrics");
    });

    it("says so when synced lyrics were asked for but only plain ones exist", async () => {
      const plainOnly = fixture<RawRow>("track-plain-only.json");
      const client = await connect(fixtureRouter({ exact: plainOnly }).impl);
      const result = await call(client, "get_lyrics", {
        artist_name: "Placeholder Artist 2",
        track_name: "Placeholder Track 2",
        format: "synced",
      });
      expect(result.isError ?? false).toBe(false);
      const structured = result.structuredContent as Record<string, unknown>;
      expect(structured.synced_lyrics ?? null).toBeNull();
      expect((structured.notes as unknown[]).length).toBeGreaterThan(0);
    });
  });

  describe("paging through a long body", () => {
    it("reports the totals and the next offset when truncating", async () => {
      const client = await connect(fixtureRouter({ exact: both }).impl);
      const result = await call(client, "get_lyrics", {
        artist_name: "Placeholder Artist 1",
        track_name: "Placeholder Track 1",
        max_chars: 200,
      });
      const structured = result.structuredContent as Record<string, unknown>;
      expect(structured.truncated).toBe(true);
      expect(structured.total_chars).toBe((both.plainLyrics as string).length);
      expect(structured.returned_chars).toBe(String(structured.plain_lyrics).length);
      expect(structured.returned_chars as number).toBeLessThanOrEqual(200);
      expect(structured.offset).toBe(0);
      expect(typeof structured.next_offset).toBe("number");
    });

    it("reassembles exactly when the caller follows next_offset", async () => {
      const client = await connect(fixtureRouter({ exact: both }).impl);
      const pieces: string[] = [];
      let offset: unknown = 0;
      let guard = 0;
      while (offset !== null && offset !== undefined) {
        const result = await call(client, "get_lyrics", {
          artist_name: "Placeholder Artist 1",
          track_name: "Placeholder Track 1",
          max_chars: 200,
          offset,
        });
        expect(result.isError ?? false).toBe(false);
        const structured = result.structuredContent as Record<string, unknown>;
        pieces.push(String(structured.plain_lyrics ?? ""));
        offset = structured.next_offset ?? null;
        expect((guard += 1)).toBeLessThan(50);
      }
      expect(pieces.length).toBeGreaterThan(1);
      const plain = both.plainLyrics as string;
      const joined = pieces.join("") === plain ? pieces.join("") : pieces.join("\n");
      expect(joined).toBe(plain);
    });

    it("marks the last page as not truncated with a null next offset", async () => {
      const client = await connect(fixtureRouter({ exact: both }).impl);
      const result = await call(client, "get_lyrics", {
        artist_name: "Placeholder Artist 1",
        track_name: "Placeholder Track 1",
        max_chars: 20_000,
      });
      const structured = result.structuredContent as Record<string, unknown>;
      expect(structured.truncated).toBe(false);
      expect(structured.next_offset ?? null).toBeNull();
    });

    it("rejects a negative offset or a non-positive max_chars", async () => {
      const client = await connect(fixtureRouter({ exact: both }).impl);
      const negativeOffset = await call(client, "get_lyrics", {
        artist_name: "a",
        track_name: "b",
        offset: -10,
      });
      expect(negativeOffset.isError).toBe(true);
      const zeroChars = await call(client, "get_lyrics", {
        artist_name: "a",
        track_name: "b",
        max_chars: 0,
      });
      expect(zeroChars.isError).toBe(true);
    });

    it("names the offending parameter when max_chars is out of range", async () => {
      const client = await connect(fixtureRouter({ exact: both }).impl);
      for (const maxChars of [1, 199, 20_001, 1_000_000]) {
        const result = await call(client, "get_lyrics", {
          artist_name: "a",
          track_name: "b",
          max_chars: maxChars,
        });
        expect(result.isError, `max_chars=${maxChars}`).toBe(true);
        expect(textOf(result)).toMatch(/max_chars/);
      }
    });
  });

  it("reports a missing track as an actionable not_found error", async () => {
    const client = await connect(fixtureRouter({ exactStatus: 404 }).impl);
    const result = await call(client, "get_lyrics", {
      artist_name: "Nobody At All",
      track_name: "No Such Song",
    });
    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toMatch(/not.?found|failed to find/i);
    expect(text).toMatch(/search_tracks|spelling|album|duration|artist/i);
    expect(text).not.toContain("undefined");
  });

  it("does not turn an upstream failure into a silent empty answer", async () => {
    const stub = makeFetch(() => new Response("boom", { status: 500 }));
    const client = await connect(stub.impl);
    const result = await call(client, "get_lyrics", { artist_name: "a", track_name: "b" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).not.toBe("");
  });
});

describe("get_track", () => {
  it("returns metadata with no lyrics and a formatted duration", async () => {
    const both = fixture<RawRow>("track-with-both.json");
    const client = await connect(fixtureRouter({ byId: { "35670801": both } }).impl);
    const result = await call(client, "get_track", { id: 35670801 });
    expect(result.isError ?? false).toBe(false);
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.duration_formatted).toBe("3:03");
    expect(structured.track).toMatchObject({
      id: 35670801,
      has_plain_lyrics: true,
      has_synced_lyrics: true,
    });
    const serialized = serialize(result);
    expect(serialized).not.toContain("Placeholder line");
    expect(serialized).not.toMatch(/\[\d\d:\d\d/);
    expect(serialized).not.toMatch(/"(plain_lyrics|synced_lyrics)"/);
  });

  it("reports an unknown id as not_found", async () => {
    const client = await connect(fixtureRouter().impl);
    const result = await call(client, "get_track", { id: 1 });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/not.?found|failed to find/i);
  });

  it("rejects a missing or nonsensical id", async () => {
    const client = await connect(fixtureRouter().impl);
    expect((await call(client, "get_track", {})).isError).toBe(true);
    expect((await call(client, "get_track", { id: "abc" })).isError).toBe(true);
    expect((await call(client, "get_track", { id: -1 })).isError).toBe(true);
  });
});

describe("the server as a whole", () => {
  it("never sends a request without identifying itself", async () => {
    const seen: (RequestInit | undefined)[] = [];
    const stub: FetchStub = makeFetch((_url, init) => {
      seen.push(init);
      return jsonResponse(searchRows);
    });
    const client = await connect(stub.impl);
    await call(client, "search_tracks", { query: "placeholder" });
    const headers = new Headers((seen[0]?.headers ?? {}) as Record<string, string>);
    expect(headers.get("user-agent")).toBeTruthy();
  });

  it("only ever reads from LRCLIB", async () => {
    const methods: string[] = [];
    const stub = makeFetch((url, init) => {
      methods.push((init?.method ?? "GET").toUpperCase());
      if (url.includes("/api/search")) return jsonResponse(searchRows);
      return jsonResponse(fixture("track-with-both.json"));
    });
    const client = await connect(stub.impl);
    await call(client, "search_tracks", { query: "placeholder" });
    await call(client, "get_lyrics", { artist_name: "a", track_name: "b" });
    await call(client, "get_track", { id: 35670801 });
    expect([...new Set(methods)]).toEqual(["GET"]);
  });
});
