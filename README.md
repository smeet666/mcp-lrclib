# mcp-lrclib

[![npm](https://img.shields.io/npm/v/mcp-lrclib.svg)](https://www.npmjs.com/package/mcp-lrclib)
[![CI](https://github.com/smeet666/mcp-lrclib/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-lrclib/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mcp-lrclib.svg)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-6E56CF)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.smeet666/mcp-lrclib)
[![Glama](https://glama.ai/mcp/servers/smeet666/mcp-lrclib/badges/score.svg)](https://glama.ai/mcp/servers/smeet666/mcp-lrclib)
[![M8ven](https://m8ven.ai/badge/mcp/smeet666-mcp-lrclib-1gu2op?variant=verified)](https://m8ven.ai/mcp/smeet666-mcp-lrclib-1gu2op)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=lrclib&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1scmNsaWIiXX0%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=lrclib&config=%7B%22name%22%3A%22lrclib%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-lrclib%22%5D%7D)

<!-- m8ven-verify: a556ead8f1e452af912eefc4f7d5fcc3 -->

[LRCLIB](https://lrclib.net) is a free, open database of song lyrics, built by
the people who use it and offered to anyone without a key or an account. It holds
two forms of the words: the plain text of a song, and the LRC form, where every
line carries the moment it is sung, which is what a karaoke display or a lyrics
panel follows along with. A track is filed there by its title, its artist, its
album and its duration, so the several releases of one song sit side by side.

This server connects a chat client to that database. You can search for a track
by title, artist or album, read the plain words of a song, read its time-synced
lines with their timestamps, and check the metadata of one release before
reading it. It needs no API key and no account.

_[Version française](#mcp-lrclib-français)_

---

## Install

**One-click install**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=lrclib&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1scmNsaWIiXX0%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=lrclib&config=%7B%22name%22%3A%22lrclib%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-lrclib%22%5D%7D)

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

Node 24 or later is required, and no environment variable has to be set.

### With Docker

```json
{
  "mcpServers": {
    "lrclib": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-lrclib:2.0.0"]
    }
  }
}
```

`-i` keeps stdin open, which is where the protocol travels, and `-t` is left out
because a TTY rewrites the stream. The container needs outbound HTTPS to
`lrclib.net`, and nothing else: no volume, no port, no credential.

### Bundle, without npm

Download `mcp-lrclib-2.0.0.mcpb` from
[the latest release](https://github.com/smeet666/mcp-lrclib/releases/latest) and
open it. A client that supports MCP bundles installs it on its own, with no npm
and no configuration file to edit. The bundle carries its dependencies, so
nothing is fetched at install time.

## What you can ask

- "Find me the lyrics of Le Sud by Nino Ferrer."
- "Give me the timed lyrics of Bohemian Rhapsody so I can follow along."
- "Which version of Hallelujah is on LRCLIB, and how long is each one?"
- "Read me the second half of those lyrics."
- "Does track 3396226 have synced lyrics?"

The ordinary path runs from a search to a reading: `search_tracks` names an `id`,
and `get_lyrics` takes that id.

## Tools

| Tool            | What it does                                                  |
| --------------- | ------------------------------------------------------------- |
| `search_tracks` | Finds tracks by title, artist or album, with their metadata.  |
| `get_lyrics`    | Reads the words of one track, plain or with their timestamps. |
| `get_track`     | Reads the metadata of one track by its id, without the words. |

LRCLIB files a track by its metadata, so a search reaches a song through its
title, its artist or its album. A word remembered from inside a song finds
nothing there.

### `search_tracks`

Finds the tracks whose metadata matches, in one free-text search or in fields of
their own. Several releases of one song come back side by side, and their album
and duration tell them apart.

| Argument      | Type                           | Required | What it does                                       |
| ------------- | ------------------------------ | -------- | -------------------------------------------------- |
| `query`       | string, 1 to 200 characters    | no       | Free-text search, as in `nino ferrer le sud`.      |
| `track_name`  | string, up to 200 characters   | no       | Song title, for a search by field.                 |
| `artist_name` | string, up to 200 characters   | no       | Artist name, for a search by field.                |
| `album_name`  | string, up to 200 characters   | no       | Album name, to narrow a search by field.           |
| `limit`       | integer, 1 to 50, default `10` | no       | Rows to serve. LRCLIB answers up to 20 per search. |

Pass `query`, or one of the three fields.

**In return:** rows carrying `id`, which `get_lyrics` and `get_track` take;
`track_name` and `artist_name`; `album_name` and `duration_seconds`, which tell
two releases of one song apart; `instrumental`; `has_plain_lyrics` and
`has_synced_lyrics`, so timed lines can be checked for before they are asked
for; and `source_url`. Alongside come `result_count` and `total_available`, the
tracks LRCLIB served before `limit` was applied. `album_name` and
`duration_seconds` are `null` on a track filed without them, and the rows carry
no words at all: `get_lyrics` reads those.

### `get_lyrics`

Reads the words of one track, either as plain text or as LRC lines carrying the
moment each one is sung. Long lyrics are served a slice at a time, resuming at a
line boundary.

| Argument           | Type                                         | Required | What it does                                                  |
| ------------------ | -------------------------------------------- | -------- | ------------------------------------------------------------- |
| `id`               | integer, positive                            | no       | The LRCLIB track id, as `search_tracks` returned it.          |
| `artist_name`      | string, up to 200 characters                 | no       | Artist name, matched exactly. Needed when `id` is absent.     |
| `track_name`       | string, up to 200 characters                 | no       | Song title, matched exactly. Needed when `id` is absent.      |
| `album_name`       | string, up to 200 characters                 | no       | Album name, to pick between releases.                         |
| `duration_seconds` | number, positive                             | no       | Track duration, to pick between versions of differing length. |
| `format`           | `plain`, `synced` or `both`, default `plain` | no       | Which form of the words to serve.                             |
| `max_chars`        | integer, 200 to 20000, default `6000`        | no       | Characters of text to serve in this call.                     |
| `offset`           | integer, 0 or more, default `0`              | no       | Character offset to resume from.                              |

**In return:** `status`, which reads `ok`, `instrumental` for a track with no
words to sing, or `no_lyrics` for one filed without them; `track` with its id,
title, artist, album, duration and `source_url`; `plain_lyrics`; `synced_lyrics`
as raw LRC text and `synced_lines` as a list of `{ time_seconds, text }`, with
`synced_lines_truncated` when the slice cut them. The reading is described by
`paginated_form`, `total_chars`, `returned_chars`, `offset`, `next_offset` and
`truncated`: pass `next_offset` back to read on, and `null` there means the end.
`attribution` is the line to cite when the words are shown. A `status` of
`instrumental` is a complete answer.

### `get_track`

Reads the metadata of one track from its id, leaving the words aside. It confirms
a release before the words are asked for, and it resolves an id carried over from
earlier in a conversation.

| Argument | Type              | Required | What it does                                         |
| -------- | ----------------- | -------- | ---------------------------------------------------- |
| `id`     | integer, positive | yes      | The LRCLIB track id, as `search_tracks` returned it. |

**In return:** `track`, holding the fields a search row carries, and
`duration_formatted` as `m:ss`, which is `null` when the track is filed without a
duration. `has_plain_lyrics` and `has_synced_lyrics` say which forms
`get_lyrics` can serve for it.

## Configuration

Every variable is optional. Set them in the `env` block of your client config.

| Variable                   | Default              | What it does                                                                                        |
| -------------------------- | -------------------- | --------------------------------------------------------------------------------------------------- |
| `LRCLIB_USER_AGENT`        | the project identity | Names your application to LRCLIB, with an address where a person can be reached.                    |
| `LRCLIB_MIN_INTERVAL_MS`   | `500`                | Gap between two requests, from 200 to 60000. A figure under the floor is refused and this one used. |
| `LRCLIB_TIMEOUT_MS`        | `15000`              | Deadline for one request, from 1000 to 120000.                                                      |
| `LRCLIB_MAX_RETRIES`       | `3`                  | Attempts after a transient failure, from 0 to 10.                                                   |
| `LRCLIB_CACHE_TTL_MS`      | `900000`             | How long an answer stays in memory, from 0 to 86400000.                                             |
| `LRCLIB_CACHE_MAX_ENTRIES` | `200`                | Answers held in memory at once, from 0 to 10000.                                                    |
| `LRCLIB_LOG_LEVEL`         | `error`              | `silent`, `error`, `info` or `debug`, written to stderr.                                            |

A value outside its range falls back to the default, and the reason is written to
stderr.

## Errors

Every failure carries one of six codes, a message, and where it helps a hint
naming the next move.

| Code             | What happened                                           | What to do                                                                                                  |
| ---------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `not_found`      | LRCLIB answered, and it holds no such track.            | Check the spelling with `search_tracks`.                                                                    |
| `invalid_input`  | The arguments were refused before any request went out. | Read the message, which names the argument.                                                                 |
| `rate_limited`   | LRCLIB asked this client to slow down.                  | Wait the number of seconds the hint names and call again with the same arguments. The track is still there. |
| `upstream_error` | LRCLIB answered in a shape this client cannot read.     | Report it at [the issue tracker](https://github.com/smeet666/mcp-lrclib/issues).                            |
| `network_error`  | The request did not complete.                           | Try again shortly.                                                                                          |
| `timeout`        | The request passed its deadline.                        | Raise `LRCLIB_TIMEOUT_MS`, or ask for a smaller `max_chars`.                                                |

## As a library

The layer reading LRCLIB is published on its own, with its pacing, its cache and
its errors, and with no protocol attached.

```ts
import { LrclibClient } from "mcp-lrclib/client";

const client = new LrclibClient();
const { data, cached } = await client.getById(3396226);
console.log(data.track_name, data.synced_lyrics !== null, cached);
```

`search`, `get` and `getById` each answer `{ data, cached }`, and throw an error
carrying one of the six codes. The floor between two requests holds here as well.

## Pacing and attribution

Requests go out one at a time with a minimum gap between them, and that floor
holds however the server is configured. The `User-Agent` always ends with the
project identity and an address where a person can be reached. LRCLIB is a free
service and publishes its API for machines to read, and this server reads it on
demand, one call at a time, in answer to something you asked for.

Every result carries the artist, the title and the address of its LRCLIB page,
and `get_lyrics` carries `attribution`, the three of them written as one line.

Song lyrics are the work of their authors and publishers. This project claims no
rights over them, ships no database of them, writes nothing to disk, and
contributes nothing back to LRCLIB. It is an unofficial project, with no
affiliation to LRCLIB.

## Development

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Tests run against generated fixtures and make no network request. The live suite,
`npm run test:live`, makes one request per route and runs nightly against the
service itself.

## Contributing

Bugs, questions and ideas belong in
[the issue tracker](https://github.com/smeet666/mcp-lrclib/issues). Pull requests
are welcome; opening an issue first helps agree on the shape of the change. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE](LICENSE). The lyrics belong to their authors and publishers,
and the database to LRCLIB and its contributors.

---

<a name="mcp-lrclib-français"></a>

# mcp-lrclib (français)

_[English version](#mcp-lrclib)_

[LRCLIB](https://lrclib.net) est une base de paroles de chansons libre et
ouverte, alimentée par ceux qui s'en servent et offerte à tous sans clé ni
compte. Elle contient deux formes des paroles : le texte simple d'une chanson, et
la forme LRC, où chaque ligne porte le moment où elle est chantée, ce que suit un
affichage karaoké ou un panneau de paroles. Un titre y est classé par son nom,
son artiste, son album et sa durée, si bien que les différentes parutions d'une
même chanson y voisinent.

Ce serveur relie un client de conversation à cette base. On peut y chercher un
titre par son nom, son artiste ou son album, lire les paroles simples d'une
chanson, lire ses lignes horodatées avec leurs marques de temps, et vérifier la
fiche d'une parution avant de la lire. Aucune clé d'API, aucun compte.

## Installation

**Installation en un clic**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=lrclib&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1scmNsaWIiXX0%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=lrclib&config=%7B%22name%22%3A%22lrclib%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-lrclib%22%5D%7D)

**Claude Code**

```bash
claude mcp add lrclib -- npx -y mcp-lrclib
```

**Claude Desktop, Cursor, et tout client au format de configuration standard**

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

Node 24 ou plus récent est nécessaire, et aucune variable d'environnement n'est à
renseigner.

### Avec Docker

```json
{
  "mcpServers": {
    "lrclib": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-lrclib:2.0.0"]
    }
  }
}
```

`-i` garde l'entrée standard ouverte, qui est le canal du protocole, et `-t` est
omis parce qu'un TTY réécrit le flux. Le conteneur a besoin d'un accès HTTPS
sortant vers `lrclib.net`, et de rien d'autre : aucun volume, aucun port, aucun
identifiant.

### Bundle, sans npm

Téléchargez `mcp-lrclib-2.0.0.mcpb` depuis
[la dernière publication](https://github.com/smeet666/mcp-lrclib/releases/latest)
et ouvrez-le. Un client qui gère les bundles MCP l'installe seul, sans npm et
sans fichier de configuration à modifier. Le bundle emporte ses dépendances, donc
rien n'est téléchargé à l'installation.

## Ce qu'on peut demander

- « Trouve-moi les paroles du Sud de Nino Ferrer. »
- « Donne-moi les paroles horodatées de Bohemian Rhapsody pour que je suive. »
- « Quelles versions de Hallelujah y a-t-il sur LRCLIB, et quelle est leur durée ? »
- « Lis-moi la seconde moitié de ces paroles. »
- « Est-ce que le titre 3396226 a des paroles synchronisées ? »

Le chemin ordinaire va d'une recherche à une lecture : `search_tracks` nomme un
`id`, et `get_lyrics` reprend cet identifiant.

## Les outils

| Outil           | Ce qu'il fait                                                   |
| --------------- | --------------------------------------------------------------- |
| `search_tracks` | Trouve des titres par nom, artiste ou album, avec leurs fiches. |
| `get_lyrics`    | Lit les paroles d'un titre, simples ou horodatées.              |
| `get_track`     | Lit la fiche d'un titre par son identifiant, sans les paroles.  |

LRCLIB classe un titre par sa fiche, donc une recherche atteint une chanson par
son nom, son artiste ou son album. Un mot retenu de l'intérieur d'une chanson n'y
trouve rien.

### `search_tracks`

Trouve les titres dont la fiche correspond, en une recherche libre ou par champs.
Plusieurs parutions d'une même chanson reviennent côte à côte, et leur album et
leur durée les distinguent.

| Argument      | Type                           | Requis | Ce qu'il fait                                             |
| ------------- | ------------------------------ | ------ | --------------------------------------------------------- |
| `query`       | chaîne, 1 à 200 caractères     | non    | Recherche libre, par exemple `nino ferrer le sud`.        |
| `track_name`  | chaîne, jusqu'à 200 caractères | non    | Nom de la chanson, pour une recherche par champs.         |
| `artist_name` | chaîne, jusqu'à 200 caractères | non    | Nom de l'artiste, pour une recherche par champs.          |
| `album_name`  | chaîne, jusqu'à 200 caractères | non    | Nom de l'album, pour resserrer une recherche par champs.  |
| `limit`       | entier, 1 à 50, défaut `10`    | non    | Lignes à servir. LRCLIB en rend jusqu'à 20 par recherche. |

Passez `query`, ou l'un des trois champs.

**En retour :** des lignes portant `id`, que `get_lyrics` et `get_track`
reprennent ; `track_name` et `artist_name` ; `album_name` et `duration_seconds`,
qui distinguent deux parutions d'une même chanson ; `instrumental` ;
`has_plain_lyrics` et `has_synced_lyrics`, qui permettent de vérifier l'existence
des lignes horodatées avant de les demander ; et `source_url`. Viennent aussi
`result_count` et `total_available`, les titres que LRCLIB a servis avant
l'application de `limit`. `album_name` et `duration_seconds` valent `null` sur un
titre classé sans eux, et les lignes ne portent aucune parole : `get_lyrics` les
lit.

### `get_lyrics`

Lit les paroles d'un titre, en texte simple ou en lignes LRC portant le moment où
chacune est chantée. Des paroles longues sont servies par tranches, coupées sur
une fin de ligne.

| Argument           | Type                                        | Requis | Ce qu'il fait                                                             |
| ------------------ | ------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| `id`               | entier, positif                             | non    | L'identifiant LRCLIB rendu par `search_tracks`.                           |
| `artist_name`      | chaîne, jusqu'à 200 caractères              | non    | Nom de l'artiste, correspondance exacte. Nécessaire sans `id`.            |
| `track_name`       | chaîne, jusqu'à 200 caractères              | non    | Nom de la chanson, correspondance exacte. Nécessaire sans `id`.           |
| `album_name`       | chaîne, jusqu'à 200 caractères              | non    | Nom de l'album, pour choisir entre des parutions.                         |
| `duration_seconds` | nombre, positif                             | non    | Durée du titre, pour choisir entre des versions de longueurs différentes. |
| `format`           | `plain`, `synced` ou `both`, défaut `plain` | non    | La forme des paroles à servir.                                            |
| `max_chars`        | entier, 200 à 20000, défaut `6000`          | non    | Caractères de texte à servir dans cet appel.                              |
| `offset`           | entier, 0 ou plus, défaut `0`               | non    | Position en caractères où reprendre.                                      |

**En retour :** `status`, qui vaut `ok`, `instrumental` pour un titre sans
paroles à chanter, ou `no_lyrics` pour un titre classé sans elles ; `track` avec
son identifiant, son nom, son artiste, son album, sa durée et son `source_url` ;
`plain_lyrics` ; `synced_lyrics` en texte LRC brut et `synced_lines` en liste de
`{ time_seconds, text }`, avec `synced_lines_truncated` quand la tranche les a
coupées. La lecture est décrite par `paginated_form`, `total_chars`,
`returned_chars`, `offset`, `next_offset` et `truncated` : redonnez `next_offset`
pour poursuivre, et `null` marque la fin. `attribution` est la ligne à citer
quand les paroles sont montrées. Un `status` à `instrumental` est une réponse
complète.

### `get_track`

Lit la fiche d'un titre depuis son identifiant, sans les paroles. Elle confirme
une parution avant qu'on demande les paroles, et elle résout un identifiant venu
d'un échange précédent.

| Argument | Type            | Requis | Ce qu'il fait                                   |
| -------- | --------------- | ------ | ----------------------------------------------- |
| `id`     | entier, positif | oui    | L'identifiant LRCLIB rendu par `search_tracks`. |

**En retour :** `track`, qui porte les champs d'une ligne de recherche, et
`duration_formatted` sous la forme `m:ss`, `null` pour un titre classé sans
durée. `has_plain_lyrics` et `has_synced_lyrics` disent quelles formes
`get_lyrics` peut servir.

## Configuration

Chaque variable est facultative. Elles se posent dans le bloc `env` de la
configuration du client.

| Variable                   | Défaut               | Ce qu'elle fait                                                                                           |
| -------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------- |
| `LRCLIB_USER_AGENT`        | l'identité du projet | Nomme votre application auprès de LRCLIB, avec une adresse où joindre une personne.                       |
| `LRCLIB_MIN_INTERVAL_MS`   | `500`                | Écart entre deux requêtes, de 200 à 60000. Une valeur sous le plancher est refusée au profit de celle-ci. |
| `LRCLIB_TIMEOUT_MS`        | `15000`              | Délai d'une requête, de 1000 à 120000.                                                                    |
| `LRCLIB_MAX_RETRIES`       | `3`                  | Tentatives après un échec passager, de 0 à 10.                                                            |
| `LRCLIB_CACHE_TTL_MS`      | `900000`             | Durée pendant laquelle une réponse reste en mémoire, de 0 à 86400000.                                     |
| `LRCLIB_CACHE_MAX_ENTRIES` | `200`                | Réponses gardées en mémoire à la fois, de 0 à 10000.                                                      |
| `LRCLIB_LOG_LEVEL`         | `error`              | `silent`, `error`, `info` ou `debug`, écrit sur la sortie d'erreur.                                       |

Une valeur hors de sa plage retombe sur le défaut, et la raison est écrite sur la
sortie d'erreur.

## Erreurs

Chaque échec porte un des six codes, un message, et quand cela aide une
indication du geste suivant.

| Code             | Ce qui s'est passé                                        | Que faire                                                                                       |
| ---------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `not_found`      | LRCLIB a répondu, et ne contient pas ce titre.            | Vérifiez l'orthographe avec `search_tracks`.                                                    |
| `invalid_input`  | Les arguments ont été refusés avant toute requête.        | Lisez le message, qui nomme l'argument.                                                         |
| `rate_limited`   | LRCLIB demande à ce client de ralentir.                   | Attendez les secondes indiquées et rappelez avec les mêmes arguments. Le titre est toujours là. |
| `upstream_error` | LRCLIB a répondu dans une forme que ce client ne lit pas. | Signalez-le sur [le suivi d'incidents](https://github.com/smeet666/mcp-lrclib/issues).          |
| `network_error`  | La requête n'a pas abouti.                                | Réessayez sous peu.                                                                             |
| `timeout`        | La requête a dépassé son délai.                           | Augmentez `LRCLIB_TIMEOUT_MS`, ou demandez un `max_chars` plus petit.                           |

## Comme bibliothèque

La couche qui lit LRCLIB est publiée seule, avec son rythme, son cache et ses
erreurs, sans protocole attaché.

```ts
import { LrclibClient } from "mcp-lrclib/client";

const client = new LrclibClient();
const { data, cached } = await client.getById(3396226);
console.log(data.track_name, data.synced_lyrics !== null, cached);
```

`search`, `get` et `getById` répondent chacun `{ data, cached }`, et lèvent une
erreur portant un des six codes. Le plancher entre deux requêtes tient également
ici.

## Rythme et attribution

Les requêtes partent une à une avec un écart minimal entre elles, et ce plancher
tient quelle que soit la configuration. Le `User-Agent` se termine toujours par
l'identité du projet et une adresse où joindre une personne. LRCLIB est un
service gratuit et publie son API pour être lue par des machines, et ce serveur
la lit à la demande, un appel à la fois, en réponse à ce que vous avez demandé.

Chaque résultat porte l'artiste, le titre et l'adresse de sa page LRCLIB, et
`get_lyrics` porte `attribution`, ces trois éléments écrits en une ligne.

Les paroles sont l'œuvre de leurs auteurs et de leurs éditeurs. Ce projet ne
revendique aucun droit dessus, n'embarque aucune base de paroles, n'écrit rien
sur le disque et ne contribue rien à LRCLIB. C'est un projet non officiel, sans
affiliation à LRCLIB.

## Développement

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Les tests s'exécutent sur des fixtures engendrées et n'émettent aucune requête.
La suite en direct, `npm run test:live`, émet une requête par route et tourne
chaque nuit contre le service lui-même.

## Contribuer

Les anomalies, les questions et les idées ont leur place dans
[le suivi d'incidents](https://github.com/smeet666/mcp-lrclib/issues). Les
propositions de modification sont bienvenues ; ouvrir un ticket d'abord aide à
s'accorder sur la forme du changement. Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

MIT, voir [LICENSE](LICENSE). Les paroles appartiennent à leurs auteurs et à
leurs éditeurs, et la base à LRCLIB et à ses contributeurs.
