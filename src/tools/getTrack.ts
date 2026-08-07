/**
 * get_track: metadata for one track, without any lyrics.
 *
 * Useful for confirming a duration or an album before paying the cost of
 * fetching lyrics, and for resolving an id a model is carrying from earlier in
 * a conversation.
 */

import { z } from "zod";
import type { LrclibClient } from "../lrclib/client.js";
import { formatDuration } from "../text/lyrics.js";
import { strictInput } from "./arguments.js";
import { ok, toToolError, toTrackMetaOut, trackMetaSchema } from "./shared.js";
import type { ToolResult } from "./shared.js";

export const getTrackDescription = [
  "Look up one LRCLIB track by its id and return its metadata without the lyrics:",
  "title, artist, album, duration, and whether plain and time-synced lyrics exist.",
  "Use this to confirm you have the right release or version before calling get_lyrics,",
  "or to check whether timed lyrics exist for a track id you already hold.",
].join(" ");

export const getTrackInput = strictInput({
  id: z.number().int().positive().describe("LRCLIB track id, as returned by search_tracks."),
});

export const getTrackOutputShape = {
  track: trackMetaSchema,
  duration_formatted: z.string().nullable().describe("Duration as m:ss, when known."),
  source: z.literal("lrclib.net"),
  notes: z.array(z.string()),
};

export interface GetTrackArgs {
  id: number;
}

export async function runGetTrack(client: LrclibClient, args: GetTrackArgs): Promise<ToolResult> {
  try {
    const { data, cached } = await client.getById(args.id);
    const track = toTrackMetaOut(data);
    const notes: string[] = [];
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");

    const duration = formatDuration(track.duration_seconds);
    const structured = {
      track,
      duration_formatted: duration,
      source: "lrclib.net" as const,
      notes,
    };

    const lyricsState = data.instrumental
      ? "instrumental, no lyrics"
      : [
          track.has_plain_lyrics ? "plain lyrics" : null,
          track.has_synced_lyrics ? "time-synced lyrics" : null,
        ]
          .filter(Boolean)
          .join(" and ") || "no lyrics on file";

    const text = [
      `${track.track_name} — ${track.artist_name}`,
      track.album_name ? `Album: ${track.album_name}` : "",
      duration ? `Duration: ${duration}` : "",
      `Available: ${lyricsState}`,
      track.source_url,
    ]
      .filter(Boolean)
      .join("\n");

    return ok(structured, text);
  } catch (error) {
    return toToolError(error);
  }
}
