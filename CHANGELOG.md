# Changelog

## 1.2.0

- Ship a `.mcpb` bundle on every release, so the server can be installed by
  opening a file rather than by having npm and a client configuration. The
  dependencies are compiled into a single file, which makes the bundle 164 kB
  and five files instead of 3 MB and two thousand: a bundle is unpacked, not
  resolved, so a copy of `node_modules` would only be dead weight. The npm build
  still keeps its dependencies external, and the two builds are separate
  configurations for that reason.
- Declare the bundle in `server.json`, with the hash the registry requires
  computed from the released file at publish time rather than committed as a
  value that goes stale on every build.

## 1.1.1

Housekeeping, with no change to what any tool returns.

- Declare the tool schemas as objects rather than as the raw shape the SDK now
  deprecates. The emitted `tools/list` is byte for byte what it was.
- Add an icon and a `websiteUrl` to `server.json`, so the registry has something
  to show next to the entry.

## 1.1.0

- Cache a response only once it has been read successfully. The cache stored
  the raw response before parsing, so a page LRCLIB served but this client could
  not understand stayed pinned for the cache lifetime and was replayed on every
  retry: the tool could not recover even after the site was healthy again. It
  now holds the parsed result, which also keeps the raw payload out of memory.

## 1.0.2

- Claim a pacing slot per request instead of per task. A task runs a whole
  retry chain, so stamping only its start let the next task follow the chain's
  last request with no gap, below the interval the configuration promises.
- Honour `Retry-After` when LRCLIB sends one, in both its seconds and its
  HTTP-date form, instead of guessing a delay. The wait is spent between
  attempts rather than after the last one, where nobody would use it.
- Treat HTTP 403 as a refusal to back off from. It was reported as a plain
  error, so the client kept its pace in the one situation where slowing down is
  the remedy.
- Bound the pacing wait by the interval. A clock stepped backwards, by NTP or a
  resumed virtual machine, made the next request wait for the size of the step,
  and the queue is serial so every pending call waited behind it.
- Enforce the pacing floor and the identifying User-Agent in the client rather
  than only when reading the environment. The client is published through the
  `./client` export and accepts a caller-built config, so both promises were
  previously optional for anyone importing the library.

## 1.0.1

- Refresh the packaged README, which now carries one-click install links for
  Cursor and VS Code and a link to the entry in the official MCP registry.
- Keep LICENSE to the plain MIT text. License detectors match the file against
  the canonical template, so the trailing scope note made the package read as
  unlicensed; that note lives in the README.

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
