/** Domain types shared by the API layer and the MCP tools. */

/**
 * A track without any lyrics text.
 *
 * This is the shape search results are reduced to. LRCLIB embeds the full plain
 * and synced lyrics in every row of a search response, which makes a single
 * search worth tens of thousands of tokens; keeping the two shapes distinct in
 * the type system is what stops that payload leaking into a tool result.
 */
export interface TrackMeta {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  /** Track duration in seconds, as reported by LRCLIB. */
  durationSeconds: number | null;
  instrumental: boolean;
  hasPlainLyrics: boolean;
  hasSyncedLyrics: boolean;
}

/** A track together with whatever lyrics LRCLIB holds for it. */
export interface TrackWithLyrics extends TrackMeta {
  plainLyrics: string | null;
  /** Raw LRC text, with one `[mm:ss.xx]` timestamp per line. */
  syncedLyrics: string | null;
}

/** One timestamped line parsed out of an LRC block. */
export interface SyncedLine {
  timeSeconds: number;
  text: string;
}

/** Identifies a track for the exact-match endpoint. */
export interface TrackQuery {
  artistName: string;
  trackName: string;
  albumName?: string;
  durationSeconds?: number;
}
