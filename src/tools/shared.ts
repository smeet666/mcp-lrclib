/** Pieces shared by the three tools: schemas, error mapping, text mirrors. */

import { z } from "zod";
import { LrclibError } from "../errors.js";
import { trackPageUrl } from "../lrclib/urls.js";
import { formatDuration } from "../text/lyrics.js";
import type { TrackMeta } from "../types.js";

/** Many MCP clients render only the text block, so it must read on its own. */
export const MAX_TEXT_MIRROR_CHARS = 1500;

export const trackMetaSchema = z.object({
  id: z.number().int().describe("LRCLIB track id. Pass this to get_lyrics or get_track."),
  track_name: z.string(),
  artist_name: z.string(),
  album_name: z.string().nullable(),
  duration_seconds: z.number().nullable(),
  instrumental: z.boolean().describe("True when LRCLIB marks the track as having no vocals."),
  has_plain_lyrics: z.boolean(),
  has_synced_lyrics: z
    .boolean()
    .describe("True when time-synced (LRC) lyrics are available for this track."),
  source_url: z.string(),
});

export type TrackMetaOut = z.infer<typeof trackMetaSchema>;

export function toTrackMetaOut(track: TrackMeta): TrackMetaOut {
  return {
    id: track.id,
    track_name: track.trackName,
    artist_name: track.artistName,
    album_name: track.albumName,
    duration_seconds: track.durationSeconds,
    instrumental: track.instrumental,
    has_plain_lyrics: track.hasPlainLyrics,
    has_synced_lyrics: track.hasSyncedLyrics,
    source_url: trackPageUrl(track.id),
  };
}

export interface ToolResult {
  // The SDK's CallToolResult carries an index signature for protocol extensions.
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Keep text from the site out of the shape this server's own lines take.
 *
 * A block that ends with lines opening "Note:" gives a caller no way to tell
 * one of those from the same words inside a title someone else wrote.
 * Indenting such a line in the body keeps the two apart without altering it:
 * the structured output still carries it exactly as published.
 */
function indentMarkerLines(body: string): string {
  return body.replace(/^(Note:)/gm, " $1");
}

/**
 * Build a result whose text block ends with its notes.
 *
 * The notes are what qualifies an answer: that an offset landed past the end of
 * a song, that timed lines were capped, that the response came from this
 * server's own cache. A client rendering only the text reads an answer with
 * nothing to qualify it, so they are appended after the body is trimmed and
 * survive a long one.
 */
export function ok(
  structured: Record<string, unknown>,
  text: string,
  notes: string[] = [],
): ToolResult {
  const trailer = notes.map((note) => `Note: ${note}`).join("\n");
  const budget = MAX_TEXT_MIRROR_CHARS - (trailer ? trailer.length + 2 : 0);
  const body = truncate(indentMarkerLines(text), Math.max(0, budget));

  return {
    content: [{ type: "text", text: trailer ? `${body}\n\n${trailer}` : body }],
    structuredContent: structured,
  };
}

/**
 * Error results carry no structuredContent: the SDK validates it against the
 * tool's declared output schema, which an error payload does not satisfy.
 */
export function toToolError(error: unknown): ToolResult {
  const known =
    error instanceof LrclibError
      ? error
      : new LrclibError("network_error", error instanceof Error ? error.message : String(error));

  const lines = [`[${known.code}] ${known.message}`];
  if (known.details.hint) {
    lines.push(`Hint: ${known.details.hint}`);
  }

  return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

/** Compact listing, showing what a model needs to pick the right version. */
export function renderTrackList(tracks: TrackMetaOut[]): string {
  return tracks
    .map((track, index) => {
      const duration = formatDuration(track.duration_seconds);
      const parts = [
        `${index + 1}. ${track.track_name} — ${track.artist_name}`,
        track.album_name ? `[${track.album_name}]` : "",
        duration ? `(${duration})` : "",
        `· id: ${track.id}`,
        track.instrumental ? "· instrumental" : "",
        track.has_synced_lyrics ? "· synced" : "· plain only",
      ];
      return parts.filter(Boolean).join(" ");
    })
    .join("\n");
}

export function attributionFor(track: TrackMetaOut): string {
  return `${track.track_name} — ${track.artist_name} via LRCLIB — ${track.source_url}`;
}
