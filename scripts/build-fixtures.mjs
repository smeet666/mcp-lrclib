/**
 * Generates the JSON fixtures used by the unit tests.
 *
 * The fixtures reproduce the exact field names and shapes LRCLIB returns, with
 * placeholder text in place of real lyrics. The parsers are checked against
 * structure, so no copyrighted text needs to live in this repository.
 *
 * Run with: npm run build:fixtures
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");

/** Placeholder plain lyrics, long enough to exercise pagination. */
function plainLyrics(n) {
  return Array.from({ length: 24 }, (_, i) => `Placeholder line ${i + 1} of track ${n}`).join("\n");
}

/** Placeholder LRC block, with the `[mm:ss.xx]` stamps LRCLIB serves. */
function syncedLyrics(n) {
  return Array.from({ length: 24 }, (_, i) => {
    const total = 12 + i * 7.5;
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = (total % 60).toFixed(2).padStart(5, "0");
    return `[${mm}:${ss}] Placeholder line ${i + 1} of track ${n}`;
  }).join("\n");
}

function track(n, overrides = {}) {
  return {
    id: 35670800 + n,
    name: `Placeholder Track ${n}`,
    trackName: `Placeholder Track ${n}`,
    artistName: `Placeholder Artist ${n % 3}`,
    albumName: n % 4 === 0 ? null : `Placeholder Album ${n}`,
    duration: 180 + n * 3,
    instrumental: false,
    plainLyrics: plainLyrics(n),
    syncedLyrics: syncedLyrics(n),
    lyricsfile: `placeholder-${n}.lrc`,
    ...overrides,
  };
}

const FIXTURES = {
  // 20 rows, the page size LRCLIB serves. Every row carries both lyric bodies,
  // which is exactly the payload search_tracks has to strip.
  "search-results.json": Array.from({ length: 20 }, (_, i) => track(i + 1)),

  "search-empty.json": [],

  "track-with-both.json": track(1),

  "track-plain-only.json": track(2, { syncedLyrics: null }),

  "track-instrumental.json": track(3, {
    instrumental: true,
    plainLyrics: null,
    syncedLyrics: null,
  }),

  "track-no-lyrics.json": track(4, { plainLyrics: null, syncedLyrics: null }),

  /** The structured error body LRCLIB returns for an unknown track. */
  "error-not-found.json": {
    message: "Failed to find specified track",
    name: "TrackNotFound",
    statusCode: 404,
  },

  /** A row missing the fields the client requires, which must be skipped. */
  "search-with-broken-row.json": [
    track(1),
    { id: null, trackName: null, artistName: null },
    track(2),
  ],
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, content] of Object.entries(FIXTURES)) {
  const json = `${JSON.stringify(content, null, 2)}\n`;
  writeFileSync(join(OUT_DIR, name), json, "utf8");
  process.stdout.write(`wrote ${name} (${json.length} bytes)\n`);
}
