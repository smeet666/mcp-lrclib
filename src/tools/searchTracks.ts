/**
 * search_tracks: find candidate tracks on LRCLIB.
 *
 * Results carry metadata only. LRCLIB embeds the full plain and synced lyrics in
 * every search row, which turns a single search into roughly 29,000 tokens; the
 * client strips them before this tool ever sees them.
 */

import { z } from "zod";
import { invalidInput } from "../errors.js";
import type { LrclibClient } from "../lrclib/client.js";
import { strictInput } from "./arguments.js";
import { ok, renderTrackList, toToolError, toTrackMetaOut, trackMetaSchema } from "./shared.js";
import type { ToolResult } from "./shared.js";

export const searchTracksDescription = [
  "Search LRCLIB for tracks by title, artist or album, and get the id needed to fetch lyrics with get_lyrics.",
  "Give either 'query' as free text, or 'track_name' and 'artist_name' separately for a narrower search.",
  "Results carry metadata only: title, artist, album, duration, and whether plain and time-synced lyrics exist.",
  "Use 'duration_seconds' and 'album_name' in the results to tell releases and re-recordings of the same song apart,",
  "and 'has_synced_lyrics' to know whether karaoke-style timed lyrics are available before fetching them.",
  "LRCLIB indexes tracks by their metadata, so it cannot search for a word appearing inside the lyrics.",
].join(" ");

export const searchTracksInput = strictInput({
  query: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("Free-text search, for example 'nino ferrer le sud'. Use this or the fields below."),
  track_name: z.string().max(200).optional().describe("Song title, for a structured search."),
  artist_name: z.string().max(200).optional().describe("Artist name, for a structured search."),
  album_name: z.string().max(200).optional().describe("Album name, to narrow a structured search."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum tracks to return. LRCLIB returns up to 20 per search."),
});

export const searchTracksOutputShape = {
  results: z.array(trackMetaSchema),
  result_count: z.number().int(),
  total_available: z.number().int().describe("Tracks LRCLIB returned before applying 'limit'."),
  source: z.literal("lrclib.net"),
  notes: z.array(z.string()),
};

export interface SearchTracksArgs {
  query?: string;
  track_name?: string;
  artist_name?: string;
  album_name?: string;
  limit: number;
}

export async function runSearchTracks(
  client: LrclibClient,
  args: SearchTracksArgs,
): Promise<ToolResult> {
  try {
    // Trimming happens before the emptiness check: a whitespace-only query is
    // as empty as a missing one, and letting it through would spend a request
    // on a free service to search for nothing.
    const query = args.query?.trim();
    const trackName = args.track_name?.trim();
    const artistName = args.artist_name?.trim();
    const albumName = args.album_name?.trim();

    if (!query && !trackName && !artistName && !albumName) {
      throw invalidInput(
        "Provide either 'query' or at least one of 'track_name' and 'artist_name'.",
        'Free text works well for a first look: query="nino ferrer le sud".',
      );
    }

    // LRCLIB ignores the structured fields when `q` is present, so the shapes
    // are kept apart rather than merged into one ambiguous request.
    const { data, cached } = await client.search(
      query
        ? { q: query }
        : {
            ...(trackName ? { trackName } : {}),
            ...(artistName ? { artistName } : {}),
            ...(albumName ? { albumName } : {}),
          },
    );

    const notes: string[] = [];
    if (cached) {
      notes.push("Served from this server's short-lived in-memory cache.");
    }
    if (data.length > args.limit) {
      notes.push(`LRCLIB returned ${data.length} tracks; showing the first ${args.limit}.`);
    }
    if (data.length === 0) {
      notes.push(
        "LRCLIB found no track with this metadata. Check the spelling, or try a broader free-text query. " +
          "Note that LRCLIB cannot search for words inside the lyrics.",
      );
    }

    const results = data.slice(0, args.limit).map(toTrackMetaOut);
    const structured = {
      results,
      result_count: results.length,
      total_available: data.length,
      source: "lrclib.net" as const,
      notes,
    };

    const header =
      results.length > 0
        ? `${results.length} track(s) on LRCLIB:`
        : "No track on LRCLIB matched that search.";

    return ok(structured, `${header}\n${renderTrackList(results)}`);
  } catch (error) {
    return toToolError(error);
  }
}
