/**
 * MCP server wiring.
 *
 * One client, one rate limiter and one cache are shared by all three tools, so
 * pacing applies to the server as a whole rather than per tool.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config, Logger } from "./config.js";
import { createLogger, loadConfig } from "./config.js";
import { LrclibClient } from "./lrclib/client.js";
import {
  getLyricsDescription,
  getLyricsInputShape,
  getLyricsOutputShape,
  runGetLyrics,
} from "./tools/getLyrics.js";
import type { GetLyricsArgs } from "./tools/getLyrics.js";
import {
  getTrackDescription,
  getTrackInputShape,
  getTrackOutputShape,
  runGetTrack,
} from "./tools/getTrack.js";
import type { GetTrackArgs } from "./tools/getTrack.js";
import {
  runSearchTracks,
  searchTracksDescription,
  searchTracksInputShape,
  searchTracksOutputShape,
} from "./tools/searchTracks.js";
import type { SearchTracksArgs } from "./tools/searchTracks.js";
import { PKG_VERSION } from "./version.js";

export interface CreateServerOptions {
  config?: Config;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}

/** This server never writes to LRCLIB, so every tool is read-only. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function createServer(options: CreateServerOptions = {}): McpServer {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? createLogger(config.logLevel);
  const client = new LrclibClient({
    config,
    logger,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  const server = new McpServer(
    { name: "mcp-lrclib", version: PKG_VERSION },
    {
      instructions:
        "Tools for looking up song lyrics on LRCLIB, including time-synced (LRC) lyrics. No API key is needed. " +
        "Typical flow: search_tracks to find a track and its id, then get_lyrics with that id. " +
        "LRCLIB indexes tracks by metadata, so it cannot find a song from a word inside its lyrics. " +
        "When you show lyrics to a user, credit the artist and link the source URL. " +
        "This server is read-only and never contributes lyrics back to LRCLIB.",
    },
  );

  server.registerTool(
    "search_tracks",
    {
      title: "Search tracks",
      description: searchTracksDescription,
      inputSchema: searchTracksInputShape,
      outputSchema: searchTracksOutputShape,
      annotations: READ_ONLY,
    },
    async (args) => runSearchTracks(client, args as SearchTracksArgs),
  );

  server.registerTool(
    "get_lyrics",
    {
      title: "Get lyrics",
      description: getLyricsDescription,
      inputSchema: getLyricsInputShape,
      outputSchema: getLyricsOutputShape,
      annotations: READ_ONLY,
    },
    async (args) => runGetLyrics(client, args as GetLyricsArgs),
  );

  server.registerTool(
    "get_track",
    {
      title: "Get track metadata",
      description: getTrackDescription,
      inputSchema: getTrackInputShape,
      outputSchema: getTrackOutputShape,
      annotations: READ_ONLY,
    },
    async (args) => runGetTrack(client, args as GetTrackArgs),
  );

  logger.info(
    `ready: user-agent="${config.userAgent}", min interval ${config.minIntervalMs}ms, cache ${config.cacheTtlMs}ms`,
  );

  return server;
}
