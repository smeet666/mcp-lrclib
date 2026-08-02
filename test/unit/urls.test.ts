import { describe, expect, it } from "vitest";
import {
  API_BASE,
  buildGetByIdUrl,
  buildGetUrl,
  buildSearchUrl,
  trackPageUrl,
} from "../../src/lrclib/urls.js";

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe("API_BASE", () => {
  it("points at the public LRCLIB API over https", () => {
    expect(API_BASE).toBe("https://lrclib.net/api");
  });
});

describe("buildSearchUrl", () => {
  it("targets /api/search", () => {
    expect(buildSearchUrl({ q: "hello" }).startsWith(`${API_BASE}/search?`)).toBe(true);
  });

  it("sends the free-text query as q", () => {
    expect(params(buildSearchUrl({ q: "born to run" }).toString()).get("q")).toBe("born to run");
  });

  it("drops the structured fields when q is given", () => {
    const search = params(
      buildSearchUrl({
        q: "born to run",
        trackName: "Born To Run",
        artistName: "Bruce Springsteen",
        albumName: "Born To Run",
      }),
    );
    expect(search.get("q")).toBe("born to run");
    expect(search.get("track_name")).toBeNull();
    expect(search.get("artist_name")).toBeNull();
    expect(search.get("album_name")).toBeNull();
    expect(search.has("trackName")).toBe(false);
  });

  it("sends the structured trio in snake_case when there is no q", () => {
    const search = params(
      buildSearchUrl({
        trackName: "Born To Run",
        artistName: "Bruce Springsteen",
        albumName: "Born To Run",
      }),
    );
    expect(search.get("track_name")).toBe("Born To Run");
    expect(search.get("artist_name")).toBe("Bruce Springsteen");
    expect(search.get("album_name")).toBe("Born To Run");
    expect(search.has("q")).toBe(false);
  });

  it("omits fields that were not supplied", () => {
    const search = params(buildSearchUrl({ artistName: "Air" }));
    expect(search.get("artist_name")).toBe("Air");
    expect(search.has("track_name")).toBe(false);
    expect(search.has("album_name")).toBe(false);
  });

  it("encodes characters that would otherwise break the query string", () => {
    const raw = 'AC/DC & "friends" ?=#+ é 日本';
    const url = buildSearchUrl({ q: raw });
    expect(params(url).get("q")).toBe(raw);
    const queryString = url.slice(url.indexOf("?") + 1);
    expect(queryString).not.toContain(" ");
    expect(queryString).not.toContain("#");
    expect(queryString).not.toContain('"');
  });

  it("keeps a query containing an ampersand in a single parameter", () => {
    const search = params(buildSearchUrl({ q: "a&b=c" }));
    expect(search.get("q")).toBe("a&b=c");
    expect([...search.keys()]).toEqual(["q"]);
  });

  it("produces a parseable URL even with no parameter at all", () => {
    expect(() => new URL(buildSearchUrl({}))).not.toThrow();
  });
});

describe("buildGetUrl", () => {
  it("targets /api/get with the artist and track", () => {
    const url = buildGetUrl({ artistName: "Air", trackName: "La femme d'argent" });
    expect(url.startsWith(`${API_BASE}/get?`)).toBe(true);
    const search = params(url);
    expect(search.get("artist_name")).toBe("Air");
    expect(search.get("track_name")).toBe("La femme d'argent");
  });

  it("omits album and duration when they are not supplied", () => {
    const search = params(buildGetUrl({ artistName: "Air", trackName: "Sexy Boy" }));
    expect(search.has("album_name")).toBe(false);
    expect(search.has("duration")).toBe(false);
  });

  it("sends album and duration when supplied", () => {
    const search = params(
      buildGetUrl({
        artistName: "Air",
        trackName: "Sexy Boy",
        albumName: "Moon Safari",
        durationSeconds: 296,
      }),
    );
    expect(search.get("album_name")).toBe("Moon Safari");
    expect(search.get("duration")).toBe("296");
  });

  it("sends a zero duration rather than treating it as absent", () => {
    const search = params(buildGetUrl({ artistName: "A", trackName: "B", durationSeconds: 0 }));
    expect(search.get("duration") ?? "0").toBe("0");
  });

  it("encodes the artist and track names", () => {
    const url = buildGetUrl({ artistName: "Sigur Rós", trackName: "Hoppípolla / live" });
    expect(params(url).get("artist_name")).toBe("Sigur Rós");
    expect(params(url).get("track_name")).toBe("Hoppípolla / live");
    expect(url.slice(url.indexOf("?"))).not.toContain(" ");
  });
});

describe("buildGetByIdUrl", () => {
  it("puts the id in the path", () => {
    expect(buildGetByIdUrl(35670801)).toBe(`${API_BASE}/get/35670801`);
  });

  it("does not add a query string", () => {
    expect(buildGetByIdUrl(1)).not.toContain("?");
  });
});

describe("trackPageUrl", () => {
  it("returns an absolute https lrclib.net URL carrying the id", () => {
    const url = trackPageUrl(35670801);
    expect(() => new URL(url)).not.toThrow();
    expect(new URL(url).protocol).toBe("https:");
    expect(new URL(url).hostname).toBe("lrclib.net");
    expect(url).toContain("35670801");
  });
});
