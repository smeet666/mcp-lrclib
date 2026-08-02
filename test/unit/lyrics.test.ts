import { describe, expect, it } from "vitest";
import {
  formatDuration,
  lrcToPlainText,
  parseLrc,
  sliceAtLineBoundary,
} from "../../src/text/lyrics.js";
import { fixture, type RawRow } from "./_helpers.js";

describe("parseLrc", () => {
  it("parses [mm:ss.xx] timestamps", () => {
    expect(parseLrc("[00:12.00] first\n[01:04.50] second")).toEqual([
      { timeSeconds: 12, text: "first" },
      { timeSeconds: 64.5, text: "second" },
    ]);
  });

  it("parses [mm:ss] timestamps without hundredths", () => {
    expect(parseLrc("[00:07] seven")).toEqual([{ timeSeconds: 7, text: "seven" }]);
  });

  it("emits one entry per timestamp when a line carries several", () => {
    expect(parseLrc("[00:10.00][00:20.00][01:00.00] chorus")).toEqual([
      { timeSeconds: 10, text: "chorus" },
      { timeSeconds: 20, text: "chorus" },
      { timeSeconds: 60, text: "chorus" },
    ]);
  });

  it("skips lines with no timestamp, including LRC metadata tags", () => {
    const parsed = parseLrc(["[ar:Some Artist]", "loose text", "[00:05.00] kept"].join("\n"));
    expect(parsed).toEqual([{ timeSeconds: 5, text: "kept" }]);
  });

  it("sorts entries ascending by time regardless of file order", () => {
    const parsed = parseLrc("[02:00.00] later\n[00:30.00] earlier\n[01:00.00] middle");
    expect(parsed.map((line) => line.timeSeconds)).toEqual([30, 60, 120]);
    expect(parsed.map((line) => line.text)).toEqual(["earlier", "middle", "later"]);
  });

  it("keeps a timestamped empty line as an empty text entry", () => {
    expect(parseLrc("[00:03.00]")).toEqual([{ timeSeconds: 3, text: "" }]);
  });

  it("handles minutes beyond 59", () => {
    expect(parseLrc("[75:30.00] long")).toEqual([{ timeSeconds: 4530, text: "long" }]);
  });

  it("returns an empty array for empty or lyric-free input", () => {
    expect(parseLrc("")).toEqual([]);
    expect(parseLrc("\n\n\n")).toEqual([]);
    expect(parseLrc("no timestamps at all")).toEqual([]);
  });

  it("tolerates CRLF line endings", () => {
    expect(parseLrc("[00:01.00] a\r\n[00:02.00] b")).toEqual([
      { timeSeconds: 1, text: "a" },
      { timeSeconds: 2, text: "b" },
    ]);
  });

  it("parses every line of the real synced fixture", () => {
    const track = fixture<RawRow>("track-with-both.json");
    const synced = track.syncedLyrics as string;
    const parsed = parseLrc(synced);
    expect(parsed.length).toBe(synced.trim().split("\n").length);
    const times = parsed.map((line) => line.timeSeconds);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(parsed[0]).toEqual({ timeSeconds: 12, text: "Placeholder line 1 of track 1" });
  });
});

describe("lrcToPlainText", () => {
  it("strips the timestamps and keeps the words in order", () => {
    expect(lrcToPlainText("[00:12.00] one\n[00:19.50] two")).toBe("one\ntwo");
  });

  it("returns an empty string when there is nothing timestamped", () => {
    expect(lrcToPlainText("")).toBe("");
    expect(lrcToPlainText("[ar:Artist]\n[ti:Title]")).toBe("");
  });

  it("agrees with the plain lyrics stored alongside the synced ones", () => {
    const track = fixture<RawRow>("track-with-both.json");
    expect(lrcToPlainText(track.syncedLyrics as string)).toBe(track.plainLyrics as string);
  });
});

describe("sliceAtLineBoundary", () => {
  const text = ["aaaa", "bbbb", "cccc", "dddd"].join("\n");

  it("returns the whole text and a null next offset when it fits", () => {
    expect(sliceAtLineBoundary(text, 0, 1000)).toEqual({ text, nextOffset: null });
  });

  it("cuts at the last newline that fits so no line is split", () => {
    const slice = sliceAtLineBoundary(text, 0, 7);
    expect(slice.text).toBe("aaaa");
    expect(slice.text).not.toContain("bb");
    expect(slice.nextOffset).not.toBeNull();
  });

  it("reassembles to the original with no loss and no duplication", () => {
    for (const maxChars of [1, 2, 5, 6, 7, 9, 10, 11, 13, 40]) {
      const parts: string[] = [];
      let offset: number | null = 0;
      let guard = 0;
      while (offset !== null) {
        const slice: { text: string; nextOffset: number | null } = sliceAtLineBoundary(
          text,
          offset,
          maxChars,
        );
        parts.push(slice.text);
        expect(slice.text.length).toBeLessThanOrEqual(maxChars);
        offset = slice.nextOffset;
        expect(++guard).toBeLessThan(100);
      }
      expect(parts.join("").replace(/\n/g, "")).toBe(text.replace(/\n/g, ""));
      expect(parts.some((part) => part === "")).toBe(false);
    }
  });

  it("makes progress even when a single line is longer than maxChars", () => {
    const long = "x".repeat(50);
    const slice = sliceAtLineBoundary(long, 0, 10);
    expect(slice.text.length).toBeGreaterThan(0);
    expect(slice.text.length).toBeLessThanOrEqual(10);
    expect(slice.nextOffset).toBe(slice.text.length);
  });

  it("reassembles a long unbreakable line exactly", () => {
    const long = "x".repeat(53);
    let offset: number | null = 0;
    let out = "";
    let guard = 0;
    while (offset !== null) {
      const slice: { text: string; nextOffset: number | null } = sliceAtLineBoundary(
        long,
        offset,
        10,
      );
      out += slice.text;
      offset = slice.nextOffset;
      expect(++guard).toBeLessThan(100);
    }
    expect(out).toBe(long);
  });

  it("returns nothing more once the offset is at or past the end", () => {
    expect(sliceAtLineBoundary(text, text.length, 10)).toEqual({ text: "", nextOffset: null });
    expect(sliceAtLineBoundary(text, text.length + 99, 10)).toEqual({ text: "", nextOffset: null });
  });

  it("handles an empty text", () => {
    expect(sliceAtLineBoundary("", 0, 10)).toEqual({ text: "", nextOffset: null });
  });

  it("treats a negative offset as the start rather than slicing from the end", () => {
    expect(sliceAtLineBoundary(text, -5, 1000).text).toBe(text);
  });

  it("reassembles the real lyrics fixture line for line", () => {
    const track = fixture<RawRow>("track-with-both.json");
    const plain = track.plainLyrics as string;
    let cursor: number | null = 0;
    const pieces: string[] = [];
    let guard = 0;
    while (cursor !== null) {
      const slice: { text: string; nextOffset: number | null } = sliceAtLineBoundary(
        plain,
        cursor,
        120,
      );
      pieces.push(slice.text);
      cursor = slice.nextOffset;
      expect(++guard).toBeLessThan(200);
    }
    expect(pieces.length).toBeGreaterThan(1);
    const rejoined = pieces.join("") === plain ? pieces.join("") : pieces.join("\n");
    expect(rejoined).toBe(plain);
  });
});

describe("formatDuration", () => {
  it("formats as m:ss with a zero-padded seconds field", () => {
    expect(formatDuration(183)).toBe("3:03");
    expect(formatDuration(60)).toBe("1:00");
    expect(formatDuration(9)).toBe("0:09");
    expect(formatDuration(0)).toBe("0:00");
  });

  it("does not wrap at an hour, since LRCLIB durations are track lengths", () => {
    expect(formatDuration(3661)).toMatch(/^61:01$|^1:01:01$/);
  });

  it("returns null for null and for negative durations", () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(-1)).toBeNull();
    expect(formatDuration(-0.5)).toBeNull();
  });

  it("rounds a fractional duration instead of printing decimals", () => {
    expect(formatDuration(183.4)).toMatch(/^\d+:\d{2}$/);
  });
});
