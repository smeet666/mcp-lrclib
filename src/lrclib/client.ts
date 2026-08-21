/**
 * High-level LRCLIB client.
 *
 * This module knows nothing about MCP, which keeps it testable against plain
 * objects and usable as a library through the `./client` export.
 */

import type { Config, Logger } from "../config.js";
import {
  DEFAULT_USER_AGENT,
  MIN_ALLOWED_INTERVAL_MS,
  createLogger,
  loadConfig,
} from "../config.js";
import { trackNotFound } from "../errors.js";
import type { TrackMeta, TrackQuery, TrackWithLyrics } from "../types.js";
import { TtlLruCache } from "./cache.js";
import { fetchJson } from "./http.js";
import { RateLimiter } from "./rateLimiter.js";
import type { SearchParams } from "./urls.js";
import { buildGetByIdUrl, buildGetUrl, buildSearchUrl } from "./urls.js";
import { toSearchResults, toTrackWithLyrics } from "./responses.js";

export interface LrclibClientOptions {
  config?: Config;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}

export interface Outcome<T> {
  data: T;
  /** True when served from the in-memory cache rather than the network. */
  cached: boolean;
}

/**
 * Apply the guarantees this project makes about its own traffic.
 *
 * The environment parser already enforces both, but `LrclibClient` is published as a
 * library through the `./client` export and takes a caller-built config, so
 * without this the pacing floor and the honest identity are optional for anyone
 * importing it. LRCLIB asks clients to identify themselves with a name, a version and a project link, and those promises hold on every path.
 *
 * A caller may still name their own application in the User-Agent. Passing the
 * traffic off as a browser is a different thing, and gets the project's own
 * identity appended so it stays attributable.
 */
function withGuarantees(config: Config): Config {
  const userAgent = /mozilla\/|applewebkit|chrome\/|safari\/|gecko/i.test(config.userAgent)
    ? `${config.userAgent} ${DEFAULT_USER_AGENT}`
    : config.userAgent;
  return {
    ...config,
    userAgent,
    minIntervalMs: Math.max(MIN_ALLOWED_INTERVAL_MS, config.minIntervalMs),
  };
}

export class LrclibClient {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly limiter: RateLimiter;
  private readonly cache: TtlLruCache<unknown>;
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(options: LrclibClientOptions = {}) {
    this.config = withGuarantees(options.config ?? loadConfig());
    this.logger = options.logger ?? createLogger(this.config.logLevel);
    this.limiter = new RateLimiter({ minIntervalMs: this.config.minIntervalMs });
    this.cache = new TtlLruCache<unknown>(this.config.cacheMaxEntries, this.config.cacheTtlMs);
    this.fetchImpl = options.fetchImpl;
  }

  /**
   * Search by free text, or by the structured track/artist/album trio.
   *
   * Returns metadata only. The lyrics LRCLIB sends alongside each row are
   * dropped here rather than at the tool layer, so no caller can accidentally
   * hand a 29,000-token payload to a model.
   */
  async search(params: SearchParams): Promise<Outcome<TrackMeta[]>> {
    const url = buildSearchUrl(params);
    return await this.fetchParsed(url, (body) => toSearchResults(body, url));
  }

  /** Exact-match lookup by artist and title, with the full lyrics. */
  async get(query: TrackQuery): Promise<Outcome<TrackWithLyrics>> {
    const url = buildGetUrl({
      artistName: query.artistName,
      trackName: query.trackName,
      ...(query.albumName ? { albumName: query.albumName } : {}),
      ...(query.durationSeconds === undefined ? {} : { durationSeconds: query.durationSeconds }),
    });
    return await this.fetchParsed(
      url,
      (body) => toTrackWithLyrics(body as object, url),
      () => trackNotFound(url, `"${query.trackName}" by "${query.artistName}"`),
    );
  }

  /** Lookup by LRCLIB id, with the full lyrics. */
  async getById(id: number): Promise<Outcome<TrackWithLyrics>> {
    const url = buildGetByIdUrl(id);
    return await this.fetchParsed(
      url,
      (body) => toTrackWithLyrics(body as object, url),
      () => trackNotFound(url, `id ${id}`),
    );
  }

  /**
   * Fetch, parse, then cache. In that order: a response that could not be read
   * is never stored, so a bad minute at LRCLIB cannot be replayed from memory
   * for the rest of the cache lifetime, leaving the tool unable to recover
   * after the service comes back.
   *
   * The cached value is the parsed result rather than the raw body, which also
   * keeps the lyrics LRCLIB embeds in every search row out of memory.
   */
  private async fetchParsed<T>(
    url: string,
    parse: (body: unknown) => T,
    onMissing?: () => Error,
  ): Promise<Outcome<T>> {
    const hit = this.cache.get(url);
    if (hit !== undefined) {
      this.logger.debug(`cache hit ${url}`);
      return { data: hit as T, cached: true };
    }

    const { status, body } = await fetchJson(url, {
      config: this.config,
      limiter: this.limiter,
      logger: this.logger,
      ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
    });

    // A 404 is a real answer, and it is deliberately not cached: a track added
    // later would otherwise stay missing for the cache lifetime.
    if (status === 404 && onMissing) {
      throw onMissing();
    }

    const data = parse(body);
    this.cache.set(url, data);
    return { data, cached: false };
  }
}
