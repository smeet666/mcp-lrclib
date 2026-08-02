/** URL construction for the LRCLIB API. */

export const API_BASE = "https://lrclib.net/api";

/** Public page for a track, used for attribution. */
export function trackPageUrl(id: number): string {
  return `https://lrclib.net/lyrics/${id}`;
}

function withParams(path: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export interface SearchParams {
  /** Free-text search across track, artist and album. */
  q?: string;
  trackName?: string;
  artistName?: string;
  albumName?: string;
}

/**
 * LRCLIB accepts either a free-text `q` or the structured trio. Sending both
 * makes the structured fields win, so callers pick one shape.
 */
export function buildSearchUrl(params: SearchParams): string {
  if (params.q) return withParams("/search", { q: params.q });
  return withParams("/search", {
    track_name: params.trackName,
    artist_name: params.artistName,
    album_name: params.albumName,
  });
}

export interface GetParams {
  artistName: string;
  trackName: string;
  albumName?: string;
  durationSeconds?: number;
}

/** Exact-match lookup. Album and duration disambiguate between versions. */
export function buildGetUrl(params: GetParams): string {
  return withParams("/get", {
    artist_name: params.artistName,
    track_name: params.trackName,
    album_name: params.albumName,
    duration: params.durationSeconds,
  });
}

export function buildGetByIdUrl(id: number): string {
  return `${API_BASE}/get/${id}`;
}
