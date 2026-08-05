/**
 * What an answer says when there is nothing left to read.
 *
 * An empty body with nothing to explain it is read as an absence: asked to
 * resume past the end of a song, a caller is told the track has no lyrics
 * rather than that it asked for a position beyond them. The two are different
 * facts and only one of them is true.
 */

import { describe, expect, it } from "vitest";
import { runGetLyrics } from "../../src/tools/getLyrics.js";
import type { LrclibClient } from "../../src/lrclib/client.js";

const TRACK = {
  id: 15833,
  trackName: "A Track",
  artistName: "An Artist",
  albumName: "An Album",
  duration: 275,
  instrumental: false,
  plainLyrics: Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n"),
  syncedLyrics: Array.from(
    { length: 40 },
    (_, i) => `[00:${String(i).padStart(2, "0")}.00] line ${i}`,
  ).join("\n"),
  sourceUrl: "https://lrclib.net/lyrics/15833",
};

const client = (): LrclibClient =>
  ({ getById: async () => ({ data: TRACK, cached: false }) }) as unknown as LrclibClient;

const call = (args: Record<string, unknown>) =>
  runGetLyrics(client(), {
    id: 15833,
    format: "plain",
    max_chars: 4000,
    offset: 0,
    ...args,
  } as never);

const textOf = (result: any) => result.content[0].text as string;

describe("an offset past the end of the lyrics", () => {
  it("is not reported as a track with nothing to show", async () => {
    const result: any = await call({ offset: 999_999 });

    expect(
      (result.structuredContent.notes as string[]).join(" "),
      "an empty body with no explanation reads as a track without lyrics",
    ).toMatch(/past the end/i);
  });

  it("says so in the text block, where a client may read nothing else", async () => {
    const text = textOf(await call({ offset: 999_999 }));

    expect(text, "'Complete.' over an empty body states the opposite of what happened").not.toMatch(
      /^Complete\.$/m,
    );
    expect(text).toMatch(/past the end/i);
  });

  it("names the length, so a caller can pick a position that exists", async () => {
    const result: any = await call({ offset: 999_999 });

    expect((result.structuredContent.notes as string[]).join(" ")).toContain(
      String(TRACK.plainLyrics.length),
    );
  });

  it("still reads normally from a position inside the lyrics", async () => {
    const result: any = await call({ offset: 10 });

    expect(result.structuredContent.returned_chars).toBeGreaterThan(0);
    expect((result.structuredContent.notes as string[]).join(" ")).not.toMatch(/past the end/i);
  });
});

describe("the notes of an answer", () => {
  it("reach the text block rather than the structured payload alone", async () => {
    const result: any = await call({ offset: 999_999 });
    const text = textOf(result);

    for (const note of result.structuredContent.notes as string[]) {
      expect(text, `note missing from the text: ${note}`).toContain(note);
    }
  });
});

describe("asking for both forms of the lyrics", () => {
  it("returns the plain text as well, which is what 'both' promises", async () => {
    const result: any = await call({ format: "both" });

    expect(result.structuredContent.plain_lyrics, "'both' returned only one of them").toBeTruthy();
    expect(result.structuredContent.synced_lyrics).toBeTruthy();
  });

  it("counts the characters of what it actually paginates", async () => {
    // With both forms in hand the counters describe the timed text, which is
    // longer than the words because of the timestamps. A caller asking how long
    // the lyrics are must not be handed the length of the LRC block.
    const result: any = await call({ format: "both" });

    expect(
      result.structuredContent.paginated_form,
      "the counters have to name which form they describe",
    ).toBe("synced");
  });
});
