/**
 * Live canary against the real LRCLIB API.
 *
 * The unit tests run against generated JSON fixtures. They prove the client maps
 * a given response shape correctly, and they can never tell that LRCLIB renamed
 * a field or changed a status code: the day it does, every fixture test stays
 * green while the published server is broken for everyone. This file is the only
 * thing that catches that, so it runs on a schedule in CI and asserts each field
 * the client depends on, so a failure names what moved.
 *
 * Excluded from the ordinary CI run: enable with LRCLIB_LIVE=1.
 */

import { describe, expect, it } from "vitest";
import { createLogger, loadConfig } from "../../src/config.js";
import { LrclibClient } from "../../src/lrclib/client.js";
import { parseLrc } from "../../src/text/lyrics.js";

const enabled = process.env.LRCLIB_LIVE === "1";

describe.runIf(enabled)("live LRCLIB", () => {
  const client = new LrclibClient({
    config: loadConfig(),
    logger: createLogger("info"),
  });

  it("still returns every field the client maps", async () => {
    const search = await client.search({ q: "nino ferrer le sud" });

    expect(
      search.data.length,
      "no results at all: /api/search may have changed its response shape",
    ).toBeGreaterThan(0);

    const first = search.data[0]!;
    expect(first.id, "id missing or not numeric").toBeGreaterThan(0);
    expect(first.trackName, "trackName empty: the field may have been renamed").not.toBe("");
    expect(first.artistName, "artistName empty: the field may have been renamed").not.toBe("");

    // Sparse per row but never absent from a whole page. Losing them everywhere
    // means the response shape changed.
    expect(
      search.data.some((track) => track.albumName !== null),
      "no result carried an album: the albumName field may have been renamed",
    ).toBe(true);
    expect(
      search.data.some((track) => track.durationSeconds !== null),
      "no result carried a duration: the duration field may have been renamed",
    ).toBe(true);
    expect(
      search.data.some((track) => track.hasSyncedLyrics),
      "no result reported synced lyrics: the syncedLyrics field may have been renamed",
    ).toBe(true);
  }, 120_000);

  it("still keeps lyrics out of search results", async () => {
    // The reason this server exists. A single search response weighs about
    // 29,000 tokens raw because every row embeds both lyric bodies; if that
    // stripping ever regresses, it must fail loudly rather than quietly cost
    // every user their context window.
    const search = await client.search({ q: "nino ferrer le sud" });
    const serialized = JSON.stringify(search.data);

    expect(serialized).not.toContain("plainLyrics");
    expect(serialized).not.toContain("syncedLyrics");
    expect(serialized, "an LRC timestamp leaked into search results").not.toMatch(/\[\d{2}:\d{2}/);
    expect(
      serialized.length,
      `search results weigh ${serialized.length} bytes; lyrics are leaking through`,
    ).toBeLessThan(20_000);
  }, 120_000);

  it("still returns parseable synced lyrics", async () => {
    const search = await client.search({ q: "nino ferrer le sud" });
    const withSynced = search.data.find((row) => row.hasSyncedLyrics)!;
    const track = await client.getById(withSynced.id);

    expect(track.data.id).toBe(withSynced.id);
    expect(
      track.data.syncedLyrics,
      "syncedLyrics missing on a track that advertised it",
    ).toBeTruthy();

    const lines = parseLrc(track.data.syncedLyrics!);
    expect(
      lines.length,
      "no timestamped line parsed: the LRC timestamp format may have changed",
    ).toBeGreaterThan(0);
    expect(lines[0]!.timeSeconds).toBeGreaterThanOrEqual(0);
    // Timestamps must come back in order, which is what any player relies on.
    for (let i = 1; i < lines.length; i += 1) {
      expect(lines[i]!.timeSeconds).toBeGreaterThanOrEqual(lines[i - 1]!.timeSeconds);
    }
  }, 120_000);

  it("still reports an unknown track as not_found", async () => {
    // Guards the 404 handling: if LRCLIB started answering 200 with an empty
    // body, the client would report a track that does not exist.
    await expect(
      client.get({ artistName: "Zzz Nonexistent Artist", trackName: "Nope Nope Nope" }),
    ).rejects.toMatchObject({ code: "not_found" });
  }, 120_000);

  it("serves a repeated request from cache", async () => {
    const first = await client.search({ q: "edith piaf" });
    const second = await client.search({ q: "edith piaf" });
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
  }, 120_000);
});
