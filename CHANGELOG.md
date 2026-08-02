# Changelog

## 0.1.1

- Bound the parsed timed lines by `max_chars`. `get_lyrics` in `synced` format
  built `synced_lines` from the whole LRC block rather than from the slice it
  returned, so the response kept growing with the length of the track while the
  raw text stayed bounded. Paging now covers the timed lines as well, and the
  lines of consecutive pages reassemble to the complete set.

## 0.1.0

Initial release. Three read-only tools over stdio, no API key: `search_tracks`,
`get_lyrics` (plain or time-synced LRC) and `get_track`.
