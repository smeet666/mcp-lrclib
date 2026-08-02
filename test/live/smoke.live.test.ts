/**
 * Live smoke test against the real LRCLIB API.
 *
 * Excluded from CI on purpose: it depends on a third-party service, and running
 * it from shared runners would put pointless load on a free service. Enable it
 * locally with LRCLIB_LIVE=1. It makes a handful of requests, paced by the real
 * rate limiter.
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

  it("searches, then reads the first result", async () => {
    const search = await client.search({ q: "nino ferrer le sud" });
    expect(search.data.length).toBeGreaterThan(0);

    const first = search.data[0]!;
    expect(first.id).toBeGreaterThan(0);
    expect(first.trackName).not.toBe("");
    expect(first.artistName).not.toBe("");

    // Search results must never carry lyrics, whatever the API sends.
    expect(Object.keys(first)).not.toContain("plainLyrics");
    expect(Object.keys(first)).not.toContain("syncedLyrics");

    const track = await client.getById(first.id);
    expect(track.data.id).toBe(first.id);
    if (track.data.syncedLyrics) {
      const lines = parseLrc(track.data.syncedLyrics);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0]!.timeSeconds).toBeGreaterThanOrEqual(0);
    }
  }, 60_000);

  it("reports an unknown track as not_found", async () => {
    await expect(
      client.get({ artistName: "Zzz Nonexistent Artist", trackName: "Nope Nope Nope" }),
    ).rejects.toMatchObject({ code: "not_found" });
  }, 60_000);

  it("serves a repeated request from cache", async () => {
    const first = await client.search({ q: "nino ferrer le sud" });
    const second = await client.search({ q: "nino ferrer le sud" });
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
  }, 60_000);
});
