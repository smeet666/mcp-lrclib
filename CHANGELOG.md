# Changelog

## 1.0.0

First stable release. The tool contracts are settled: tool names, their
parameters and the shape of their structured output will only change in a future
major version.

Every tool has been exercised end to end against the live LRCLIB API, including
the paths that are easy to get wrong: search results carrying no lyrics at all,
pagination that bounds both the raw text and the parsed timed lines, tracks with
no lyrics on file, instrumental tracks as a successful answer rather than an
error, and blank input rejected before any request leaves the process.

## 0.1.1

- Bound the parsed timed lines by `max_chars`. `get_lyrics` in `synced` format
  built `synced_lines` from the whole LRC block rather than from the slice it
  returned, so the response kept growing with the length of the track while the
  raw text stayed bounded. Paging now covers the timed lines as well, and the
  lines of consecutive pages reassemble to the complete set.

## 0.1.0

Initial release. Three read-only tools over stdio, no API key: `search_tracks`,
`get_lyrics` (plain or time-synced LRC) and `get_track`.
