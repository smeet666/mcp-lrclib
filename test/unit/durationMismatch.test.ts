/**
 * What a duration that matches nothing should mean.
 *
 * 'duration_seconds' is offered as a way of choosing between versions of a
 * song. LRCLIB treats it as part of the key instead, so a value that fits no
 * release turns a track it holds into a track it says it has never heard of,
 * and the answer goes on to blame the spelling of a title that was spelled
 * correctly. An optional argument must not be able to manufacture an absence.
 */

import { describe, expect, it } from "vitest";
import { runGetLyrics } from "../../src/tools/getLyrics.js";
import type { LrclibClient } from "../../src/lrclib/client.js";
import { LrclibError } from "../../src/errors.js";

const TRACK = {
  id: 35670834,
  trackName: "Le sud",
  artistName: "Nino Ferrer",
  albumName: "Nino Ferrer",
  durationSeconds: 272,
  hasPlainLyrics: true,
  hasSyncedLyrics: false,
  instrumental: false,
  plainLyrics: "Le sud\nC'est comme le paradis",
  syncedLyrics: null,
  sourceUrl: "https://lrclib.net/lyrics/35670834",
};

/** Answers only when no duration is asked for, as LRCLIB does. */
const exactDurationClient = () => {
  const seen: Array<number | undefined> = [];
  const client = {
    get: async (query: { durationSeconds?: number }) => {
      seen.push(query.durationSeconds);
      if (query.durationSeconds !== undefined && query.durationSeconds !== TRACK.durationSeconds) {
        throw new LrclibError("not_found", 'LRCLIB has no track matching "Le sud".', {
          url: "https://lrclib.net/api/get",
          status: 404,
        });
      }
      return { data: TRACK, cached: false };
    },
  } as unknown as LrclibClient;

  return { client, seen };
};

const call = (client: LrclibClient, durationSeconds?: number) =>
  runGetLyrics(client, {
    artist_name: "Nino Ferrer",
    track_name: "Le Sud",
    ...(durationSeconds === undefined ? {} : { duration_seconds: durationSeconds }),
    format: "plain",
    max_chars: 4000,
    offset: 0,
  } as never);

const textOf = (result: any) => result.content[0].text as string;

describe("a duration that matches no release of an existing track", () => {
  it("returns the track rather than reporting it as absent", async () => {
    const { client } = exactDurationClient();
    const result: any = await call(client, 30);

    expect(result.isError, "the track exists, and a hint about it does not").toBeFalsy();
    expect(result.structuredContent.track.id).toBe(35670834);
  });

  it("asks again without the duration rather than giving up on the first refusal", async () => {
    const { client, seen } = exactDurationClient();
    await call(client, 30);

    expect(seen).toEqual([30, undefined]);
  });

  it("says the duration was set aside, and what came back instead", async () => {
    const { client } = exactDurationClient();
    const result: any = await call(client, 30);
    const notes = (result.structuredContent.notes as string[]).join(" ");

    expect(notes).toMatch(/30/);
    expect(
      notes,
      "the caller has to be able to tell it did not get the version it asked for",
    ).toMatch(/272/);
  });

  it("puts that in the text block, where a client may read nothing else", async () => {
    const { client } = exactDurationClient();

    expect(textOf(await call(client, 30))).toMatch(/272/);
  });

  it("leaves a duration that does match alone, and adds no note", async () => {
    const { client, seen } = exactDurationClient();
    const result: any = await call(client, 272);

    expect(seen).toEqual([272]);
    expect((result.structuredContent.notes as string[]).join(" ")).not.toMatch(
      /set aside|ignored/i,
    );
  });

  it("still reports a genuinely unknown track as absent", async () => {
    const client = {
      get: async () => {
        throw new LrclibError("not_found", 'LRCLIB has no track matching "Nope".', {
          url: "https://lrclib.net/api/get",
          status: 404,
        });
      },
    } as unknown as LrclibClient;

    const result: any = await call(client, 30);

    expect(result.isError).toBe(true);
  });
});
