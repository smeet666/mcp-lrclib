# mcp-lrclib

[![npm](https://img.shields.io/npm/v/mcp-lrclib.svg)](https://www.npmjs.com/package/mcp-lrclib)
[![CI](https://github.com/smeet666/mcp-lrclib/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-lrclib/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mcp-lrclib.svg)](./LICENSE)

An [MCP](https://modelcontextprotocol.io) server for [LRCLIB](https://lrclib.net).
Search tracks and read their lyrics, including **time-synced (LRC) lyrics** with a
timestamp on every line. **No API key, no account, no configuration.**

_(Version française plus bas / [French version below](#mcp-lrclib-français))_

---

## Quickstart

**Claude Code**

```bash
claude mcp add lrclib -- npx -y mcp-lrclib
```

**Claude Desktop, Cursor, and any client using the standard config format**

```json
{
  "mcpServers": {
    "lrclib": {
      "command": "npx",
      "args": ["-y", "mcp-lrclib"]
    }
  }
}
```

## Tools

| Tool            | What it does                                           | Key parameters                                                     |
| --------------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| `search_tracks` | Finds tracks by title, artist or album. Metadata only. | `query`, `track_name`, `artist_name`, `album_name`, `limit`        |
| `get_lyrics`    | Reads the lyrics of one track, plain or time-synced.   | `id`, `artist_name`, `track_name`, `format`, `max_chars`, `offset` |
| `get_track`     | Track metadata for one id, without lyrics.             | `id`                                                               |

Search returns an LRCLIB `id` for every result; `get_lyrics` takes that id. That is
the intended chain: search, then read.

The server is **read-only**. It never contributes lyrics back to LRCLIB.

### Things worth knowing

**Search results never carry lyrics.** LRCLIB embeds the full plain and synced
lyrics in every row of a search response, which makes one search worth roughly
29,000 tokens. This server strips them, bringing the same 20 results down to about
800 tokens. Fetch the text you actually want with `get_lyrics`.

**Time-synced lyrics are the point.** `format: "synced"` returns the raw LRC block
plus a parsed list of `{time_seconds, text}` entries, ready to drive a karaoke
display or line up with audio. Check `has_synced_lyrics` in the search results
first: not every track has them.

**Duration and album disambiguate versions.** LRCLIB holds several entries for the
same song across releases and re-recordings. Pass `duration_seconds` and
`album_name` to pin the right one, or use the `id` from search and skip the
question entirely.

**Instrumental tracks are an answer.** They come back with `status: "instrumental"`
as a successful result with no text, so there is nothing to retry.

**LRCLIB searches metadata, not lyrics.** It cannot find a song from a word inside
its lyrics. For that, see [mcp-lyricscom](https://github.com/smeet666/mcp-lyricscom),
which covers exactly that case.

## Configuration

Every variable is optional. Set them in the `env` block of your MCP client config.

| Variable                   | Default                              | Purpose                                                        |
| -------------------------- | ------------------------------------ | -------------------------------------------------------------- |
| `LRCLIB_USER_AGENT`        | `mcp-lrclib v<version> (<repo url>)` | User-Agent sent to LRCLIB.                                     |
| `LRCLIB_MIN_INTERVAL_MS`   | `500`                                | Minimum gap between requests. Values below 200 ms are ignored. |
| `LRCLIB_TIMEOUT_MS`        | `15000`                              | Per-request timeout.                                           |
| `LRCLIB_MAX_RETRIES`       | `3`                                  | Retries on rate limiting and transient errors.                 |
| `LRCLIB_CACHE_TTL_MS`      | `900000`                             | In-memory cache lifetime (15 minutes).                         |
| `LRCLIB_CACHE_MAX_ENTRIES` | `200`                                | In-memory cache size.                                          |
| `LRCLIB_LOG_LEVEL`         | `error`                              | `silent`, `error`, `info` or `debug`. Logs go to stderr.       |

LRCLIB asks third-party clients to identify themselves with a name, a version and a
project link, which the default User-Agent does. Please keep that shape if you
override it.

## How it works

LRCLIB offers a real public JSON API, so this server makes plain HTTP calls to
`https://lrclib.net/api` and maps the responses. It sends one request at a time,
paces itself, backs off when rate limited, and keeps a small in-memory cache. A
search already returns the lyrics of every result, so a `get_lyrics` call right
after a search is usually served from cache with no second request.

## Development

```bash
npm install
npm run build:fixtures   # regenerate the JSON test fixtures
npm test                 # unit tests, no network
npm run typecheck
npm run build
LRCLIB_LIVE=1 npm run test:live   # hits the real API, excluded from CI
npm run inspector        # explore the tools in the MCP Inspector
```

Fixtures are generated, not captured: they reproduce LRCLIB's field names and
shapes with placeholder text, so the tests are deterministic and no copyrighted
lyrics live in this repository.

The API layer (`src/lrclib`, `src/text`) does not import the MCP SDK and is
published separately as `mcp-lrclib/client`, so it can be used as a plain library.

## Lyrics and copyright

Song lyrics are copyrighted works owned by their authors and publishers. This
project claims no rights over them, and neither the lyrics nor any database of
them ships with it.

This server is a client for LRCLIB's public API, which LRCLIB provides free of
charge and explicitly invites third-party clients to use. It requests data on
demand, one call at a time, in response to an explicit request from you or your
assistant. It writes nothing to disk and contributes nothing back to LRCLIB.

Every result carries the artist, the title and a source URL. If you display or
reuse anything this server returns, keep that attribution and link back to the
source.

This is an unofficial project, with no affiliation to or endorsement by LRCLIB.

## License

MIT. See [LICENSE](./LICENSE). The license covers this source code only, not the
lyrics retrieved through it.

---

<a name="mcp-lrclib-français"></a>

# mcp-lrclib (français)

Un serveur [MCP](https://modelcontextprotocol.io) pour [LRCLIB](https://lrclib.net).
Cherchez des morceaux et lisez leurs paroles, y compris les **paroles synchronisées
(LRC)**, horodatées ligne par ligne. **Sans clé d'API, sans compte, sans configuration.**

## Démarrage rapide

**Claude Code**

```bash
claude mcp add lrclib -- npx -y mcp-lrclib
```

**Claude Desktop, Cursor, et tout client utilisant le format standard**

```json
{
  "mcpServers": {
    "lrclib": {
      "command": "npx",
      "args": ["-y", "mcp-lrclib"]
    }
  }
}
```

## Outils

| Outil           | Rôle                                                                 | Paramètres principaux                                              |
| --------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `search_tracks` | Trouve des morceaux par titre, artiste ou album. Métadonnées seules. | `query`, `track_name`, `artist_name`, `album_name`, `limit`        |
| `get_lyrics`    | Lit les paroles d'un morceau, simples ou synchronisées.              | `id`, `artist_name`, `track_name`, `format`, `max_chars`, `offset` |
| `get_track`     | Métadonnées d'un morceau, sans les paroles.                          | `id`                                                               |

La recherche renvoie un `id` LRCLIB pour chaque résultat, et `get_lyrics` prend cet
id. C'est l'enchaînement prévu : chercher, puis lire.

Le serveur est en **lecture seule**. Il ne contribue jamais de paroles à LRCLIB.

### Ce qu'il faut savoir

**Les résultats de recherche ne contiennent jamais de paroles.** LRCLIB embarque les
paroles complètes, simples et synchronisées, dans chaque ligne de résultat, ce qui
porte une seule recherche à environ 29 000 tokens. Ce serveur les retire, ramenant
les mêmes 20 résultats à environ 800 tokens. Le texte se récupère ensuite avec
`get_lyrics`.

**Les paroles synchronisées sont l'intérêt principal.** `format: "synced"` renvoie
le bloc LRC brut et une liste analysée de `{time_seconds, text}`, directement
exploitable pour du karaoké ou un calage sur l'audio. Vérifiez d'abord
`has_synced_lyrics` dans les résultats : tous les morceaux n'en ont pas.

**Durée et album départagent les versions.** LRCLIB conserve plusieurs entrées pour
un même titre selon les éditions et réenregistrements. Passez `duration_seconds` et
`album_name` pour viser la bonne, ou utilisez l'`id` issu de la recherche.

**Un morceau instrumental est une réponse.** Il revient en `status: "instrumental"`,
résultat réussi et sans texte : inutile de réessayer.

**LRCLIB cherche dans les métadonnées, pas dans les paroles.** Il ne sait pas
retrouver une chanson à partir d'un mot du texte. Pour cela, voyez
[mcp-lyricscom](https://github.com/smeet666/mcp-lyricscom), qui couvre exactement ce
besoin.

## Configuration

Toutes les variables sont optionnelles, à déclarer dans le bloc `env` de votre client.

| Variable                   | Défaut                                   | Rôle                                                              |
| -------------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| `LRCLIB_USER_AGENT`        | `mcp-lrclib v<version> (<url du dépôt>)` | User-Agent envoyé à LRCLIB.                                       |
| `LRCLIB_MIN_INTERVAL_MS`   | `500`                                    | Écart minimal entre requêtes. Sous 200 ms, la valeur est ignorée. |
| `LRCLIB_TIMEOUT_MS`        | `15000`                                  | Délai d'attente par requête.                                      |
| `LRCLIB_MAX_RETRIES`       | `3`                                      | Tentatives en cas de limitation ou d'erreur passagère.            |
| `LRCLIB_CACHE_TTL_MS`      | `900000`                                 | Durée de vie du cache mémoire (15 minutes).                       |
| `LRCLIB_CACHE_MAX_ENTRIES` | `200`                                    | Taille du cache mémoire.                                          |
| `LRCLIB_LOG_LEVEL`         | `error`                                  | `silent`, `error`, `info` ou `debug`. Logs sur stderr.            |

LRCLIB demande aux clients tiers de s'identifier par un nom, une version et un lien
vers le projet, ce que fait le User-Agent par défaut. Merci d'en conserver la forme
si vous le remplacez.

## Fonctionnement

LRCLIB expose une véritable API JSON publique. Ce serveur fait donc de simples
appels HTTP vers `https://lrclib.net/api` et transpose les réponses. Il envoie une
requête à la fois, s'impose un rythme, ralentit en cas de limitation et garde un
petit cache mémoire. Comme la recherche rapporte déjà les paroles de chaque
résultat, un `get_lyrics` juste après est généralement servi depuis le cache, sans
seconde requête.

## Développement

```bash
npm install
npm run build:fixtures   # régénère les fixtures JSON de test
npm test                 # tests unitaires, sans réseau
npm run typecheck
npm run build
LRCLIB_LIVE=1 npm run test:live   # touche la vraie API, exclu de la CI
npm run inspector        # explorer les outils dans le MCP Inspector
```

Les fixtures sont générées, pas capturées : elles reproduisent les noms de champs et
les formes de LRCLIB avec du texte de remplissage, ce qui rend les tests
déterministes et évite de stocker des paroles sous droits dans ce dépôt.

La couche API (`src/lrclib`, `src/text`) n'importe pas le SDK MCP et est publiée
séparément sous `mcp-lrclib/client`, utilisable comme simple bibliothèque.

## Paroles et droits d'auteur

Les paroles de chansons sont des œuvres protégées, propriété de leurs auteurs et
éditeurs. Ce projet ne revendique aucun droit dessus, et n'embarque ni paroles ni
base de paroles.

Ce serveur est un client de l'API publique de LRCLIB, service gratuit qui invite
explicitement les clients tiers à l'utiliser. Il demande les données à la demande,
un appel à la fois, en réponse à une demande explicite de votre part ou de celle de
votre assistant. Il n'écrit rien sur le disque et ne contribue rien à LRCLIB.

Chaque résultat porte l'artiste, le titre et une URL source. Si vous affichez ou
réutilisez ce que renvoie ce serveur, conservez cette attribution et le lien vers la
source.

Projet non officiel, sans affiliation à LRCLIB ni approbation de sa part.

## Licence

MIT, voir [LICENSE](./LICENSE). La licence couvre uniquement le code source, pas les
paroles récupérées par son intermédiaire.
