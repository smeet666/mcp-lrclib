import { describe, expect, it } from "vitest";
import {
  toApiError,
  toSearchResults,
  toTrackMeta,
  toTrackWithLyrics,
} from "../../src/lrclib/responses.js";
import { LrclibError } from "../../src/errors.js";
import { fixture, lyricBodies, type RawRow } from "./_helpers.js";

const URL_UNDER_TEST = "https://lrclib.net/api/search?q=test";

const richRow: RawRow = fixture<RawRow>("track-with-both.json");

/** Every string reachable from a value, however deeply nested. */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      allStrings(item, out);
    }
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      allStrings(item, out);
    }
  }
  return out;
}

describe("toTrackMeta", () => {
  it("maps the LRCLIB fields onto the domain names", () => {
    expect(toTrackMeta(richRow, URL_UNDER_TEST)).toEqual({
      id: 35670801,
      trackName: "Placeholder Track 1",
      artistName: "Placeholder Artist 1",
      albumName: "Placeholder Album 1",
      durationSeconds: 183,
      instrumental: false,
      hasPlainLyrics: true,
      hasSyncedLyrics: true,
    });
  });

  describe("the no-lyrics rule", () => {
    it("exposes no key whose name mentions lyrics beyond the two booleans", () => {
      const meta = toTrackMeta(richRow, URL_UNDER_TEST) as unknown as Record<string, unknown>;
      const lyricKeys = Object.keys(meta).filter((key) => /lyric/i.test(key));
      expect(lyricKeys.sort()).toEqual(["hasPlainLyrics", "hasSyncedLyrics"]);
    });

    it("carries no lyric text anywhere in the returned value", () => {
      const meta = toTrackMeta(richRow, URL_UNDER_TEST);
      const serialized = JSON.stringify(meta);
      for (const body of lyricBodies([richRow])) {
        expect(serialized).not.toContain(body.slice(0, 30));
      }
      expect(serialized).not.toContain("Placeholder line");
      expect(serialized).not.toContain("[00:12.00]");
      expect(allStrings(meta).join("|")).not.toMatch(/\[\d\d:\d\d/);
    });

    it("does not smuggle the lyrics through a non-enumerable or prototype property", () => {
      const meta = toTrackMeta(richRow, URL_UNDER_TEST);
      const names = [
        ...Object.getOwnPropertyNames(meta),
        ...Object.getOwnPropertyNames(Object.getPrototypeOf(meta) ?? {}),
      ];
      for (const name of names) {
        const value = (meta as unknown as Record<string, unknown>)[name];
        if (typeof value === "string") {
          expect(value).not.toContain("Placeholder line");
        }
      }
      expect(names).not.toContain("plainLyrics");
      expect(names).not.toContain("syncedLyrics");
    });

    it("keeps no reference to the raw row that could be walked back to the lyrics", () => {
      const meta = toTrackMeta(richRow, URL_UNDER_TEST);
      for (const value of Object.values(meta)) {
        expect(typeof value === "object" && value !== null).toBe(false);
      }
    });
  });

  describe("the lyric availability booleans", () => {
    it("reports false when a lyric field is null, missing or blank", () => {
      const base = { id: 1, trackName: "t", artistName: "a" };
      expect(toTrackMeta({ ...base }, URL_UNDER_TEST)).toMatchObject({
        hasPlainLyrics: false,
        hasSyncedLyrics: false,
      });
      expect(
        toTrackMeta({ ...base, plainLyrics: null, syncedLyrics: null }, URL_UNDER_TEST),
      ).toMatchObject({ hasPlainLyrics: false, hasSyncedLyrics: false });
      expect(
        toTrackMeta({ ...base, plainLyrics: "", syncedLyrics: "   " }, URL_UNDER_TEST),
      ).toMatchObject({ hasPlainLyrics: false, hasSyncedLyrics: false });
    });

    it("reports the two kinds independently", () => {
      const plainOnly = fixture<RawRow>("track-plain-only.json");
      expect(toTrackMeta(plainOnly, URL_UNDER_TEST)).toMatchObject({
        hasPlainLyrics: true,
        hasSyncedLyrics: false,
      });
    });
  });

  describe("optional and malformed fields", () => {
    it("keeps a missing album as null", () => {
      const noAlbum = fixture<RawRow>("track-no-lyrics.json");
      expect(toTrackMeta(noAlbum, URL_UNDER_TEST).albumName).toBeNull();
      expect(
        toTrackMeta({ id: 1, trackName: "t", artistName: "a" }, URL_UNDER_TEST).albumName,
      ).toBeNull();
    });

    it("keeps a missing or non-numeric duration as null", () => {
      const base = { id: 1, trackName: "t", artistName: "a" };
      expect(toTrackMeta(base, URL_UNDER_TEST).durationSeconds).toBeNull();
      expect(toTrackMeta({ ...base, duration: "183" }, URL_UNDER_TEST).durationSeconds).toBeNull();
      expect(toTrackMeta({ ...base, duration: null }, URL_UNDER_TEST).durationSeconds).toBeNull();
    });

    it("defaults instrumental to false and always returns a boolean", () => {
      const base = { id: 1, trackName: "t", artistName: "a" };
      expect(toTrackMeta(base, URL_UNDER_TEST).instrumental).toBe(false);
      expect(toTrackMeta({ ...base, instrumental: true }, URL_UNDER_TEST).instrumental).toBe(true);
      expect(toTrackMeta({ ...base, instrumental: false }, URL_UNDER_TEST).instrumental).toBe(
        false,
      );
      // LRCLIB always sends a real boolean; anything else is untrusted input and
      // only has to come back as a boolean rather than throwing.
      for (const value of ["yes", 1, null, {}]) {
        expect(
          typeof toTrackMeta({ ...base, instrumental: value }, URL_UNDER_TEST).instrumental,
        ).toBe("boolean");
      }
    });

    it("marks an instrumental track as having no lyrics", () => {
      const instrumental = fixture<RawRow>("track-instrumental.json");
      expect(toTrackMeta(instrumental, URL_UNDER_TEST)).toMatchObject({
        instrumental: true,
        hasPlainLyrics: false,
        hasSyncedLyrics: false,
      });
    });

    it("rejects a row with no usable identity", () => {
      expect(() => toTrackMeta({ trackName: "t", artistName: "a" }, URL_UNDER_TEST)).toThrow(
        LrclibError,
      );
      expect(() => toTrackMeta({ id: 1, artistName: "a" }, URL_UNDER_TEST)).toThrow(LrclibError);
      expect(() => toTrackMeta({ id: 1, trackName: "t" }, URL_UNDER_TEST)).toThrow(LrclibError);
      expect(() =>
        toTrackMeta({ id: "35670801", trackName: "t", artistName: "a" }, URL_UNDER_TEST),
      ).toThrow(LrclibError);
    });

    it("mentions the offending URL when it rejects a row", () => {
      try {
        toTrackMeta({}, URL_UNDER_TEST);
        expect.unreachable("expected a LrclibError");
      } catch (error) {
        expect(error).toBeInstanceOf(LrclibError);
        expect((error as LrclibError).details.url).toBe(URL_UNDER_TEST);
      }
    });
  });
});

describe("toTrackWithLyrics", () => {
  it("keeps both lyric bodies alongside the metadata", () => {
    const track = toTrackWithLyrics(richRow, URL_UNDER_TEST);
    expect(track.plainLyrics).toBe(richRow.plainLyrics);
    expect(track.syncedLyrics).toBe(richRow.syncedLyrics);
    expect(track).toMatchObject({
      id: 35670801,
      durationSeconds: 183,
      hasPlainLyrics: true,
      hasSyncedLyrics: true,
    });
  });

  it("returns null lyrics for an instrumental track", () => {
    const track = toTrackWithLyrics(fixture<RawRow>("track-instrumental.json"), URL_UNDER_TEST);
    expect(track.plainLyrics).toBeNull();
    expect(track.syncedLyrics).toBeNull();
    expect(track.instrumental).toBe(true);
  });

  it("returns null lyrics for a track LRCLIB simply has nothing for", () => {
    const track = toTrackWithLyrics(fixture<RawRow>("track-no-lyrics.json"), URL_UNDER_TEST);
    expect(track.plainLyrics).toBeNull();
    expect(track.syncedLyrics).toBeNull();
    expect(track.instrumental).toBe(false);
  });

  it("normalises a blank lyric body to null rather than an empty string", () => {
    const track = toTrackWithLyrics(
      { id: 1, trackName: "t", artistName: "a", plainLyrics: "", syncedLyrics: "  " },
      URL_UNDER_TEST,
    );
    expect(track.plainLyrics).toBeNull();
    expect(track.syncedLyrics).toBeNull();
  });
});

describe("toSearchResults", () => {
  it("maps every readable row of the real search fixture, lyrics stripped", () => {
    const rows = fixture<RawRow[]>("search-results.json");
    const results = toSearchResults(rows, URL_UNDER_TEST);
    expect(results).toHaveLength(20);
    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain("Placeholder line");
    expect(serialized).not.toContain("[00:");
    for (const body of lyricBodies(rows)) {
      expect(serialized).not.toContain(body.slice(0, 25));
    }
  });

  it("is dramatically smaller than the payload it was given", () => {
    const rows = fixture<RawRow[]>("search-results.json");
    const rawSize = JSON.stringify(rows).length;
    const mappedSize = JSON.stringify(toSearchResults(rows, URL_UNDER_TEST)).length;
    expect(mappedSize).toBeLessThan(rawSize / 5);
  });

  it("returns an empty array for an empty result set", () => {
    expect(toSearchResults(fixture("search-empty.json"), URL_UNDER_TEST)).toEqual([]);
  });

  it("skips unreadable rows instead of throwing", () => {
    const rows = fixture<RawRow[]>("search-with-broken-row.json");
    const results = toSearchResults(rows, URL_UNDER_TEST);
    expect(results).toHaveLength(2);
    expect(results.map((row) => row.id)).toEqual([35670801, 35670802]);
  });

  it("skips non-object entries", () => {
    const results = toSearchResults(
      [null, "nope", 42, { id: 7, trackName: "t", artistName: "a" }],
      URL_UNDER_TEST,
    );
    expect(results.map((row) => row.id)).toEqual([7]);
  });

  it("throws on a payload that is not an array", () => {
    for (const payload of [null, undefined, "[]", 42, {}, { results: [] }]) {
      expect(() => toSearchResults(payload, URL_UNDER_TEST)).toThrow(LrclibError);
    }
  });
});

describe("toApiError", () => {
  it("reads LRCLIB's structured 404 body", () => {
    expect(toApiError(fixture("error-not-found.json"))).toEqual({
      name: "TrackNotFound",
      message: "Failed to find specified track",
      statusCode: 404,
    });
  });

  it("returns null for a body that is not a structured error", () => {
    for (const payload of [null, undefined, "", "boom", 404, [], {}, { message: "only" }]) {
      expect(toApiError(payload)).toBeNull();
    }
  });

  it("returns null rather than throwing on a hostile body", () => {
    expect(toApiError({ name: 1, message: 2, statusCode: "x" })).toBeNull();
  });
});
