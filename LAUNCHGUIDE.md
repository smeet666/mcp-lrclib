# mcp-lrclib

## Tagline

Song lyrics from LRCLIB, plain or timed line by line, with no API key.

## Description

An MCP server for LRCLIB, a free and open lyrics database. Search tracks by
title, artist or album, then read the words, either as plain text or as LRC
text carrying a timestamp on every line, which is what a karaoke display or a
subtitle track needs.

Long lyrics are paginated rather than truncated, instrumental tracks come back
as a valid answer instead of an error, and every result carries the link back
to LRCLIB. The server is read-only and contributes nothing back.

It is for anyone who wants an assistant to quote a song accurately, credit it,
and link where it came from.

## Setup Requirements

- `LRCLIB_USER_AGENT` (optional): Identify your own client. The project's own identifier is appended so LRCLIB can always reach a human.
- `LRCLIB_MIN_INTERVAL_MS` (optional): Minimum gap between requests. Default 500, and values below 200 are refused.
- `LRCLIB_TIMEOUT_MS` (optional): Per-request deadline. Default 15000.
- `LRCLIB_CACHE_TTL_MS` (optional): In-memory cache lifetime. Default 900000. Set 0 to turn it off.
- `LRCLIB_LOG_LEVEL` (optional): silent, error, info or debug. Default error, on stderr.

No API key and no account are needed.

## Category

Content & Media

## Features

- Search LRCLIB by free text, or by title, artist and album separately
- Read plain lyrics, time-synced LRC lyrics, or both in one call
- Parsed timestamped lines, ready to drive a display
- Tell releases and re-recordings apart by album and duration
- Pagination that resumes at a line boundary rather than mid-word
- A duration that fits no release returns the track and says so, instead of reporting an absence
- Instrumental tracks answered as instrumental, so nothing retries them
- Attribution and a source link on every result
- Self-paced requests and an honest User-Agent, out of respect for a free service

## Getting Started

- "What are the lyrics of Le Sud by Nino Ferrer?"
- "Give me the timed lyrics of Bohemian Rhapsody so I can build a karaoke file"
- "Which version of Hallelujah is on the album Various Positions, and how long is it?"
- Tool: search_tracks — Finds tracks by title, artist or album, and returns the id the other tools take
- Tool: get_lyrics — Reads the lyrics of one track, plain or time-synced
- Tool: get_track — Metadata for one id, without the lyrics

## Tags

lyrics, lrc, synced-lyrics, karaoke, music, songs, lrclib, no-api-key, read-only

## Documentation URL

https://github.com/smeet666/mcp-lrclib#readme
