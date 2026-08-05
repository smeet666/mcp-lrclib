/**
 * get_lyrics: fetch the lyrics of one track, plain or time-synced.
 */

import { z } from "zod";
import { invalidInput } from "../errors.js";
import type { LrclibClient } from "../lrclib/client.js";
import { formatDuration, parseLrc, sliceAtLineBoundary } from "../text/lyrics.js";
import type { TrackWithLyrics } from "../types.js";
import { attributionFor, ok, toToolError, toTrackMetaOut, truncate } from "./shared.js";
import type { ToolResult } from "./shared.js";

/** Timed lines are compact, but a long song still warrants a ceiling. */
const MAX_SYNCED_LINES = 400;

export const getLyricsDescription = [
  "Fetch the lyrics of one track from LRCLIB, given the id returned by search_tracks, or an exact artist and title.",
  'Set \'format\' to "synced" for karaoke-style lyrics with a timestamp on every line, "plain" for the text alone,',
  "or \"both\". Check 'has_synced_lyrics' in the search results first: not every track has timed lyrics.",
  "Lyrics can be long, so the text is truncated by default: check 'truncated' and call again with 'offset' set to",
  "'next_offset' to continue reading.",
  'Instrumental tracks come back with status "instrumental" and no text, which is a valid answer, so do not retry them.',
  "Always cite 'attribution' when showing lyrics to a user.",
].join(" ");

export const getLyricsInputShape = {
  id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("LRCLIB track id, as returned by search_tracks. Preferred over the name fields."),
  artist_name: z
    .string()
    .max(200)
    .optional()
    .describe("Artist name, matched exactly by LRCLIB. Required when 'id' is absent."),
  track_name: z
    .string()
    .max(200)
    .optional()
    .describe("Song title, matched exactly by LRCLIB. Required when 'id' is absent."),
  album_name: z.string().max(200).optional().describe("Album name, to pick between releases."),
  duration_seconds: z
    .number()
    .positive()
    .optional()
    .describe("Track duration, to pick between versions of differing length."),
  format: z
    .enum(["plain", "synced", "both"])
    .default("plain")
    .describe(
      "'plain' returns the text only. 'synced' returns LRC text plus a parsed list of timestamped lines. " +
        "'both' returns each of them.",
    ),
  max_chars: z
    .number()
    .int()
    .min(200)
    .max(20000)
    .default(6000)
    .describe("Maximum characters of lyrics text to return in this call."),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Character offset to resume from, for lyrics longer than max_chars."),
};

const syncedLineSchema = z.object({
  time_seconds: z.number(),
  text: z.string(),
});

export const getLyricsOutputShape = {
  status: z.enum(["ok", "instrumental", "no_lyrics"]),
  track: z.object({
    id: z.number().int(),
    track_name: z.string(),
    artist_name: z.string(),
    album_name: z.string().nullable(),
    duration_seconds: z.number().nullable(),
    source_url: z.string(),
  }),
  plain_lyrics: z.string().nullable(),
  synced_lyrics: z.string().nullable().describe("Raw LRC text, one timestamp per line."),
  synced_lines: z.array(syncedLineSchema).nullable().describe("Parsed timestamped lines."),
  synced_lines_truncated: z.boolean(),
  paginated_form: z
    .enum(["plain", "synced"])
    .describe(
      "Which body the character counts and the offset describe. Timed text carries its timestamps, so it is longer than the words alone.",
    ),
  total_chars: z.number().int(),
  returned_chars: z.number().int(),
  offset: z.number().int(),
  next_offset: z.number().int().nullable(),
  truncated: z.boolean(),
  attribution: z.string(),
  source: z.literal("lrclib.net"),
  notes: z.array(z.string()),
};

export interface GetLyricsArgs {
  id?: number;
  artist_name?: string;
  track_name?: string;
  album_name?: string;
  duration_seconds?: number;
  format: "plain" | "synced" | "both";
  max_chars: number;
  offset: number;
}

export async function runGetLyrics(client: LrclibClient, args: GetLyricsArgs): Promise<ToolResult> {
  try {
    const { track, cached } = await resolveTrack(client, args);
    const meta = toTrackMetaOut(track);
    const attribution = attributionFor(meta);
    const notes: string[] = [];
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");

    const trackOut = {
      id: meta.id,
      track_name: meta.track_name,
      artist_name: meta.artist_name,
      album_name: meta.album_name,
      duration_seconds: meta.duration_seconds,
      source_url: meta.source_url,
    };

    const base = {
      track: trackOut,
      plain_lyrics: null,
      synced_lyrics: null,
      synced_lines: null,
      synced_lines_truncated: false,
      paginated_form: "plain" as const,
      total_chars: 0,
      returned_chars: 0,
      offset: 0,
      next_offset: null,
      truncated: false,
      attribution,
      source: "lrclib.net" as const,
    };

    // An instrumental track has no lyrics by nature, which is an answer rather
    // than a failure. Reporting it as an error would invite pointless retries.
    if (track.instrumental) {
      return ok(
        { ...base, status: "instrumental" as const, notes },
        `${attribution}\nLRCLIB marks this track as instrumental, so it has no lyrics.`,
        notes,
      );
    }

    const wantsSynced = args.format === "synced" || args.format === "both";
    const wantsPlain = args.format === "plain" || args.format === "both";

    if (wantsSynced && !track.syncedLyrics) {
      notes.push(
        track.plainLyrics
          ? "LRCLIB has no time-synced lyrics for this track; only the plain text is available."
          : "LRCLIB has no lyrics of either kind for this track.",
      );
    }

    if (!track.plainLyrics && !track.syncedLyrics) {
      return ok(
        { ...base, status: "no_lyrics" as const, notes },
        `${attribution}\nLRCLIB has a record for this track but no lyrics on file.`,
        notes,
      );
    }

    // The pagination budget applies to whichever body is the primary payload,
    // so that offset arithmetic stays meaningful across calls.
    const primary =
      wantsSynced && track.syncedLyrics ? track.syncedLyrics : (track.plainLyrics ?? "");
    const slice = sliceAtLineBoundary(primary, args.offset, args.max_chars);

    // Timed lines are parsed from the returned slice, not from the whole song.
    // Parsing the full text would carry every line of the lyrics regardless of
    // max_chars, so the pagination budget would bound the raw text while the
    // response still grew with the length of the track.
    const allLines = wantsSynced && track.syncedLyrics ? parseLrc(slice.text) : null;
    const syncedLines = allLines ? allLines.slice(0, MAX_SYNCED_LINES) : null;
    const syncedTruncated = allLines !== null && allLines.length > MAX_SYNCED_LINES;
    if (syncedTruncated) {
      notes.push(
        `Timed lines are capped at ${MAX_SYNCED_LINES} per call; continue with offset=${slice.nextOffset ?? 0}.`,
      );
    }

    const paginatedForm =
      wantsSynced && track.syncedLyrics ? ("synced" as const) : ("plain" as const);

    // An offset beyond the text yields an empty body, which on its own reads as
    // a track that carries no words. What happened is that the caller asked for
    // a position that does not exist, and only saying so tells the two apart.
    const pastTheEnd = args.offset > 0 && slice.text === "" && primary.length > 0;
    if (pastTheEnd) {
      notes.push(
        `offset=${args.offset} is past the end of a ${paginatedForm} body of ${primary.length} characters. Call again with offset=0 to read it from the start.`,
      );
    }

    const structured = {
      ...base,
      status: "ok" as const,
      paginated_form: paginatedForm,
      plain_lyrics: wantsPlain ? (track.plainLyrics ?? null) : null,
      synced_lyrics: wantsSynced && track.syncedLyrics ? slice.text : null,
      synced_lines: syncedLines
        ? syncedLines.map((line) => ({ time_seconds: line.timeSeconds, text: line.text }))
        : null,
      synced_lines_truncated: syncedTruncated,
      total_chars: primary.length,
      returned_chars: slice.text.length,
      offset: args.offset,
      next_offset: slice.nextOffset,
      truncated: slice.nextOffset !== null,
      notes,
    };

    // When plain text is the primary payload it also honours the slice, so a
    // long song does not arrive whole regardless of max_chars.
    if (wantsPlain && !(wantsSynced && track.syncedLyrics)) {
      structured.plain_lyrics = slice.text;
    }

    const duration = formatDuration(meta.duration_seconds);
    const summary = [
      attribution,
      duration ? `Duration ${duration}.` : "",
      `${structured.total_chars} characters of ${paginatedForm} text.`,
      pastTheEnd
        ? `Nothing at offset=${args.offset}: that is past the end. Call again with offset=0.`
        : slice.nextOffset !== null
          ? `Truncated: call again with offset=${slice.nextOffset} to continue.`
          : "Complete.",
      syncedLines ? `${syncedLines.length} timed lines.` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return ok(structured, truncate(`${summary}\n\n${slice.text}`, 4000), notes);
  } catch (error) {
    return toToolError(error);
  }
}

async function resolveTrack(
  client: LrclibClient,
  args: GetLyricsArgs,
): Promise<{ track: TrackWithLyrics; cached: boolean }> {
  if (args.id !== undefined) {
    const { data, cached } = await client.getById(args.id);
    return { track: data, cached };
  }

  if (!args.artist_name || !args.track_name) {
    throw invalidInput(
      "Provide either 'id', or both 'artist_name' and 'track_name'.",
      "Ids come from search_tracks and avoid the exact-spelling requirement entirely.",
    );
  }

  const { data, cached } = await client.get({
    artistName: args.artist_name,
    trackName: args.track_name,
    ...(args.album_name ? { albumName: args.album_name } : {}),
    ...(args.duration_seconds !== undefined ? { durationSeconds: args.duration_seconds } : {}),
  });
  return { track: data, cached };
}
