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

export function ok(structured: Record<string, unknown>, text: string): ToolResult {
  return {
    content: [{ type: "text", text: truncate(text, MAX_TEXT_MIRROR_CHARS) }],
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
  if (known.details.hint) lines.push(`Hint: ${known.details.hint}`);

  return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
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
