/**
 * Lyrics text handling: LRC parsing and line-aware slicing.
 */

import type { SyncedLine } from "../types.js";

/**
 * `[mm:ss.xx]` or `[mm:ss]`, with two or three fractional digits.
 * A line can carry several timestamps when the same text repeats.
 */
const TIMESTAMP_RE = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/**
 * Parse an LRC block into timestamped lines.
 *
 * Malformed or untimed lines are skipped rather than guessed at: a wrong
 * timestamp is worse than a missing one for anything that syncs to audio.
 */
export function parseLrc(lrc: string): SyncedLine[] {
  const lines: SyncedLine[] = [];

  for (const rawLine of lrc.split("\n")) {
    TIMESTAMP_RE.lastIndex = 0;
    const stamps: number[] = [];
    for (
      let match = TIMESTAMP_RE.exec(rawLine);
      match !== null;
      match = TIMESTAMP_RE.exec(rawLine)
    ) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
      if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) continue;
      stamps.push(minutes * 60 + seconds + fraction);
    }
    if (stamps.length === 0) continue;

    const text = rawLine.replace(TIMESTAMP_RE, "").trim();
    for (const timeSeconds of stamps) {
      lines.push({ timeSeconds, text });
    }
  }

  lines.sort((a, b) => a.timeSeconds - b.timeSeconds);
  return lines;
}

/** Strip the timestamps from an LRC block, keeping the text. */
export function lrcToPlainText(lrc: string): string {
  return parseLrc(lrc)
    .map((line) => line.text)
    .join("\n");
}

export interface Slice {
  text: string;
  nextOffset: number | null;
}

/**
 * Cut at the last newline that fits, so a continuation never splits a line in
 * half. Falls back to a hard cut for a single line longer than the budget.
 */
export function sliceAtLineBoundary(text: string, offset: number, maxChars: number): Slice {
  // A negative offset is clamped to the start. String.slice would otherwise read
  // from the end of the text, silently returning the wrong part of a song.
  const start = Math.max(0, Math.trunc(offset));
  if (start >= text.length) return { text: "", nextOffset: null };

  const remaining = text.slice(start);
  if (remaining.length <= maxChars) return { text: remaining, nextOffset: null };

  const window = remaining.slice(0, maxChars);
  const lastBreak = window.lastIndexOf("\n");
  const cut = lastBreak > 0 ? lastBreak : maxChars;
  return { text: remaining.slice(0, cut), nextOffset: start + cut };
}

/** Seconds to `m:ss`, for the human-readable mirror of a duration. */
export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}
