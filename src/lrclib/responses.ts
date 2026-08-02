/**
 * Mapping from LRCLIB's JSON to the domain types.
 *
 * The single most important function here is `toTrackMeta`, which drops the
 * lyrics fields. LRCLIB embeds full plain and synced lyrics in every row of a
 * search response: a 20-result search weighs about 115 KB, roughly 29,000
 * tokens, of which the metadata is 3 KB. Search results therefore go through
 * `toTrackMeta` and never through `toTrackWithLyrics`.
 */

import { malformedResponse } from "../errors.js";
import type { TrackMeta, TrackWithLyrics } from "../types.js";

/** Raw row as served by LRCLIB. Every field is treated as untrusted. */
interface RawTrack {
  id?: unknown;
  trackName?: unknown;
  artistName?: unknown;
  albumName?: unknown;
  duration?: unknown;
  instrumental?: unknown;
  plainLyrics?: unknown;
  syncedLyrics?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Metadata only. Lyrics are deliberately unreachable from the returned value. */
export function toTrackMeta(raw: RawTrack, url: string): TrackMeta {
  const id = asNumber(raw.id);
  const trackName = asString(raw.trackName);
  const artistName = asString(raw.artistName);
  if (id === null || trackName === null || artistName === null) {
    throw malformedResponse(url);
  }

  return {
    id,
    trackName,
    artistName,
    albumName: asString(raw.albumName),
    durationSeconds: asNumber(raw.duration),
    instrumental: raw.instrumental === true,
    hasPlainLyrics: asString(raw.plainLyrics) !== null,
    hasSyncedLyrics: asString(raw.syncedLyrics) !== null,
  };
}

export function toTrackWithLyrics(raw: RawTrack, url: string): TrackWithLyrics {
  return {
    ...toTrackMeta(raw, url),
    plainLyrics: asString(raw.plainLyrics),
    syncedLyrics: asString(raw.syncedLyrics),
  };
}

/** A search response is an array; anything else means the API changed. */
export function toSearchResults(payload: unknown, url: string): TrackMeta[] {
  if (!Array.isArray(payload)) throw malformedResponse(url);

  const results: TrackMeta[] = [];
  for (const row of payload) {
    // One unreadable row must not sink an otherwise usable page of results.
    try {
      results.push(toTrackMeta(row as RawTrack, url));
    } catch {
      process.stderr.write(`[mcp-lrclib] skipped an unreadable search row from ${url}\n`);
    }
  }
  return results;
}

/** LRCLIB's structured error body, when it sends one. */
export interface ApiError {
  name: string;
  message: string;
  statusCode: number;
}

export function toApiError(payload: unknown): ApiError | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.name !== "string" || typeof candidate.message !== "string") return null;
  return {
    name: candidate.name,
    message: candidate.message,
    statusCode: typeof candidate.statusCode === "number" ? candidate.statusCode : 0,
  };
}
