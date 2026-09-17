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
| **Major** | An existing link no longer shows what it used to. A parameter is gone, renamed with no fallback, has a new meaning or unit, or a changed default moves links that leave it out. |
| **Minor** | New parameters, new spellings, or new accepted values. Every old link still resolves the same way. |
| **Patch** | No change to the URL surface at all: fixes, performance, layout, translations, backend work. |

A parameter and all its aliases live in `urlArgNames` in
[`frontend/src/js/URL.ts`](../frontend/src/js/URL.ts), and the values some of
them take are elsewhere — basemap names in `MapAPI.ts`, for instance. A change to
any of that is a version question; a change to anything else is not.

Removing a parameter is a major bump, but it is usually avoidable, and worth
avoiding. When the paths checkbox became a path-width dial, `pw` replaced `pa` —
but `parseURL` still reads `pa`, and reads `pa=0` as a width of zero, so links
from before the dial still work. That kept it a minor bump. Basemaps did the same
thing: the MapLibre rewrite kept the Leaflet-era names wherever the same map
still existed, and an unrecognized one warns and falls back to the default rather
than failing.

## How we got to 1.3.0

`v1.0.0` was tagged at `b47af4d8`. Since then the URL surface has grown three
times and never broken:

- `1.1.0` — `5df44f4f`, the MapLibre/WebGL rewrite: adds `pitch`, `bearing` and
  `terrain` (the map can be tilted, turned, and given 3D terrain).
- `1.2.0` — `3dcb155a`, the path-width dial: adds `pw`, keeps reading `pa`.
- `1.3.0` — `576951fc`, the dot-colour dial: adds `cr`.

Everything else in those 33 commits — the WebGL dot layer, i18n, shared maps, the
history log, the stream encoding — is invisible to a saved link, so it is patch
work by this rule, however large it was.

## The build string

The number alone does not say which build is running, so the app reports it with
[semver build metadata](https://semver.org/#spec-item-10) after a `+`:

```
1.3.0+g1d39764          built from commit 1d39764
1.3.0+g1d39764.dirty    ...with uncommitted changes (a dev checkout)
1.3.0+heroku.1019       Heroku release v1019; the commit was not available
1.3.0                   neither was available
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

1. Decide the bump by the table above — look at what changed in `URL.ts`:
   `git diff <last tag>..HEAD -- frontend/src/js/URL.ts`.
2. Put the new number in `/VERSION` and in `frontend/package.json` (which mirrors
   it; nothing reads it, but a stale number there is a lie).
3. Add the release to the list above if it moved the URL surface, with the commit
   that did it.
4. Commit, then tag: `git tag -a v1.3.0 -m "…"` and `git push --tags`.
5. Pushing `main` deploys production; check the console banner on the deployed
   site to confirm the version it reports.
