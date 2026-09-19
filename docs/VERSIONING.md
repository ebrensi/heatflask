# Versioning

Heatflask's version number is in [`/VERSION`](../VERSION) and is bumped by hand.
It is [semantic](https://semver.org), and the thing it makes a promise about is
**the parameters in a map's URL**.

## Why the URL

Heatflask keeps the whole view — the query, the map position, the animation
settings — in the page's URL, so a link is a saved visualization. People bookmark
those links, mail them, and post them. The URL is therefore the app's public
interface, in a way that no Python or TypeScript signature in here is: nobody
else calls our functions, but other people's links call our parameters.

So the version answers one question: **will the links people already have still
show them what they showed before?**

| Bump      | Means                                                                    |
| --------- | ------------------------------------------------------------------------ |
| **Major** | An existing link no longer shows what it used to, although we could still have shown it. A name is gone or renamed with no fallback, a parameter has a new meaning or unit, or a changed default moves links that leave it out. |
| **Minor** | New names — parameters, spellings, whatever — with every old one still accepted. Every old link still resolves the same way. |
| **Patch** | No name changed: fixes, performance, layout, translations, backend work. |

What is promised is **the names**: the parameters in `urlArgNames` in
[`frontend/src/js/URL.ts`](../frontend/src/js/URL.ts), and the names of the
values they take, such as the basemap keys in `MapAPI.ts`.

What is not promised is what those names point at. Basemaps come and go with the
services that serve them, and a `bl` naming one we no longer have falls back to
the default — which is a fine outcome: the reader picks another map and gets on
with it. So adding a basemap or dropping one is patch work, however visible.
Renaming one is not, because there the map is still here and the link simply
can't ask for it any more.

Breaking a parameter is a major bump, but it is usually avoidable, and worth
avoiding. When the paths checkbox became a path-width dial, `pw` replaced `pa` —
but `parseURL` still reads `pa`, and reads `pa=0` as a width of zero, so links
from before the dial still work. That kept it a minor bump. Basemaps do it with
an alias: each one in `MapAPI.ts` lists under `aka` every name it has gone by
here, `resolveBaselayer` accepts any of them, and a name that matches nothing
warns and falls back to the default rather than failing.

## How we got here

`v1.0.0` was tagged at `b47af4d8`. Since then the URL surface has grown five
times and never broken:

- `1.1.0` — `5df44f4f`, the MapLibre/WebGL rewrite: adds `pitch`, `bearing` and
  `terrain` (the map can be tilted, turned, and given 3D terrain).
- `1.2.0` — `3dcb155a`, the path-width dial: adds `pw`, keeps reading `pa`.
- `1.3.0` — `576951fc`, the dot-colour dial: adds `cr`.
- `1.4.0` — the basemaps named for the maps they are rather than for the
  leaflet-providers keys they were transcribed from: twelve keys renamed
  (`CARTO.Positron` for `CartoDB.Positron`, `Mapbox.SatelliteStreets` for
  `Mapbox.satellite`, and so on). Every old name is kept as an `aka`, which is
  what keeps it minor; a link carrying one is rewritten to the current name when
  the URL next updates.
- `1.5.0` — `5bf94c19`, the Shadows checkbox: adds `sh` (also spelled
  `shadows`). It defaults to on, which is how every map was already drawn, so
  a link that leaves it out looks the same as it did.

Everything else in those commits — the WebGL dot layer, i18n, shared maps, the
history log, the stream encoding — is invisible to a saved link, so it is patch
work by this rule, however large it was.

## The build string

The number alone does not say which build is running, so the app reports it with
[semver build metadata](https://semver.org/#spec-item-10) after a `+`:

```
1.4.0+g2d5d5fc          built from commit 2d5d5fc
1.4.0+g2d5d5fc.dirty    ...with uncommitted changes (a dev checkout)
1.4.0+heroku.1019       Heroku release v1019; the commit was not available
1.4.0                   neither was available
```

Build metadata is ignored when versions are compared, so it is free to carry
whatever identifies the build.

`config.py` assembles it at startup from the first of these that it finds:

1. `GIT_COMMIT` — what our Dockerfile bakes in from `--build-arg GIT_COMMIT=…`.
2. `SOURCE_VERSION` — set by Heroku's buildpack builds and by most CI.
3. `HEROKU_BUILD_COMMIT`, then `HEROKU_SLUG_COMMIT` — Heroku dyno metadata, if
   `heroku labs:enable runtime-dyno-build-metadata` is on for the app.
4. `git rev-parse HEAD` in a development checkout, plus `.dirty` if the working
   tree has changes. There is no git and no `.git` in the container, so this only
   ever answers in development.
5. `HEROKU_RELEASE_VERSION` — names the deploy when the commit is unavailable.

Heroku's container builder passes nothing of its own to a `heroku.yml` build (its
`build.config` values are static strings in the file), which is why production
needs one of the later fallbacks unless a build arg is passed in.

The frontend prints the whole string to the browser console at startup, inside
the banner, so a screenshot or a console paste from someone reporting a problem
says exactly what they were running.

## Cutting a release

1. Decide the bump by the table above — look at what changed in the parameters
   and in the values they take:
   `git diff <last tag>..HEAD -- frontend/src/js/URL.ts frontend/src/js/MapAPI.ts`.
2. Put the new number in `/VERSION` and in `frontend/package.json` (which mirrors
   it; nothing reads it, but a stale number there is a lie).
3. Add the release to the list above if it moved the URL surface, with the commit
   that did it.
4. Commit, then tag: `git tag -a v1.4.0 -m "…"` and `git push --tags`.
5. Pushing `main` deploys production; check the console banner on the deployed
   site to confirm the version it reports.
