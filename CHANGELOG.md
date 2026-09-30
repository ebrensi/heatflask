# Changelog

Notable changes to Heatflask, newest first. Version numbers follow
[docs/VERSIONING.md](docs/VERSIONING.md): they track the map URL's parameters,
so a minor or patch release never breaks a saved link. Versions between the
sections below were tagged without release notes; each section covers
everything since the one before it.

## Unreleased

## [1.7.4] — 2026-09-30

### The app
- **Fairer imports under Strava's rate limit.** An athlete's activity index, which costs a few reads and without which nothing can be drawn, now goes ahead of everyone's track imports. An athlete who has had 200 tracks from Strava in a day drops to a lower priority that leaves a third of every window for everyone else. The map says when it is waiting on the rate limit, and counts down to when it will carry on.
- A new account with no activities on Strava yet gets a message saying so, instead of an empty map that looked broken.
- A page whose login expired while it stayed open reloads as a visitor's page, which offers a login, instead of showing account controls that no longer work. Using those controls after the login expired now leads to logging in again instead of an error.
- The **info tab** shows the app version.
- **Korean.** Its line breaking is set to wrap only between words; browsers otherwise treat Hangul like Chinese and split words across lines.
- The update prompt appears only when a deploy changed the frontend. Open pages used to be asked to reload after every deploy, including ones that changed only the backend. A desktop window also checks when it is clicked back into, rather than only when it is shown again after being minimised or on another tab.

### Privacy
- **Followers-only activities were shown on shared maps.** The filter looked for the visibility `followers`, but Strava calls it `followers_only`, so those activities passed as public. They are now hidden from everyone but their owner.
- The admin no longer gets around an athlete's privacy settings: maps that are not shared, and private activities, are hidden from the admin as from anyone else, and only the athlete can turn Shared Maps on or off.
- Activity summaries are kept for 60 days after you last open your own map, down from 90.

### Under the hood
- The frontend build is named by a hash of the frontend's source (`frontend/tools/build-id.mjs`), and `/version` reports it alongside the app version. Parcel's output is not reproducible, so the source is hashed rather than the build.
- `SKIP_TTL` leaves the TTLs of existing collections as they are, for an app that shares another's database (heatflask-dev shares production's), where each app otherwise reset them to its own values at startup.
- The `/users` admin listing shows each user's language and their browser's, and is sorted by when they last opened a map.
- Translation catalogues no longer carry strings the app does not use.

## [1.7.3] — 2026-09-24

### Under the hood
- Access is revoked through Strava's new **`/oauth/revoke`** endpoint rather than `/oauth/deauthorize`, which Strava retires on 1 June 2027. It takes the refresh token as is, so revoking no longer costs a token refresh first, and it accepts tokens that are already dead, so inactive users whose tokens have died are retired on the first try instead of the third.
- Token exchanges send the client secret and token in the form body instead of the URL.
- Strava's move of the API to a new host (`api-v3.strava.com`) is still to come: the host does not exist until 4 January 2027.

## [1.7.2] — 2026-09-23

The first release since v1.0.0: nine days, a new map engine, and a lot of new ways to look at your activities. Every map link made since v1.0.0 still opens the same map (see [docs/VERSIONING.md](docs/VERSIONING.md)).

### The map
- **MapLibre GL and WebGL** replace Leaflet. The dot animation is drawn on the GPU, and the map can be tilted and rotated (ctrl- or alt-drag), shown with **3D terrain**, or drawn as a **globe**.
- **Shadows** under dots and paths, with terrain hiding whatever is behind a hill. Selected activities' dots are drawn as spheres and the rest as cubes.
- **Maps draw while they load.** Tracks appear as they arrive rather than when the last one is in, so a first map that is waiting on Strava's rate limit can be explored in the meantime. Auto-zoom follows the incoming activities until you move the map yourself.
- Zoomed far out, activities too small to see are gathered into **cluster markers**.
- New dials for **path width** and **dot colour**, a **sport-type filter** (`sport=` / `nosport=` in the URL), a "show my location" button, and basemaps named for the maps they are.
- Shift-drag selects activities on the map; the activity pop-up and list were refined.

### The app
- **32 languages**, including right-to-left layouts for Arabic-script languages. The first pass is machine translation; corrections are welcome.
- **Installable** as an app from the browser, with a prompt to reload when a new version is deployed.
- Adjustable sidebar text size, and default map settings you can save from the profile tab.

### Privacy
- **Shared Maps:** your map is shown to other people only if you turn on the Shared Maps switch. Accounts start private. Visiting a private map while logged out now offers a login, since it is often the owner's own map. See [docs/PRIVACY.md](docs/PRIVACY.md).
- The public user directory has been removed.

### Under the hood
- Strava reads are paced by the rate-limit headers Strava sends, and each 15-minute window is **shared fairly between athletes** whose imports are running at the same time, so one large backfill no longer holds everyone else up for the whole window.
- Queries are about half a second faster: a poll for index imports used to sleep before checking whether one was running.
- Fixed a memory blow-up in stream imports, and streams with long time gaps or fewer than two samples that could not be encoded.
- A 30-day server history log (no IP addresses or user agents) for diagnosing problems.
- Development: a Nix flake is the one way to set up, Ruff replaces Black and Flake8, dependencies are pinned by hash, and CI runs the tests, linters and typechecker.

## [1.0.0] — 2026-09-14

After 10 years of alpha status, the first stable release. It keeps the look and
feel of the original, with several updates:

- Activity streams cached in the browser, for fast, low-bandwidth use
- `mp4` video export in place of `gif`
- Corrected dot-location computation
- Faster data transfer and caching
- Improved pan and zoom performance

### How it got here

About 690 commits separate this from 0.4.0-alpha. Most of them went into a
rewrite, frontend first and then backend, that was set aside in 2022 and
finished in September 2026. The 2020 app, kept on the `legacy2020` branch,
served www.heatflask.com the whole time.

- **2020: a real frontend build.** Parcel bundling began in March 2020, in
  place of Flask-Assets, and in April "total frontend refactoring" started:
  the code became ES modules with npm dependencies, Leaflet was imported as
  modules, and Parcel 2 (then in beta) built it. Map tiles were cached in
  IndexedDB and made much faster to read back that October, and the backend
  gained an offline mode for development without a network.
- **2021: TypeScript, and WebAssembly.** The frontend moved to TypeScript in
  January 2021. The same winter, drawing was moved into AssemblyScript
  compiled to WebAssembly. It measured slower than plain JavaScript and was
  never switched on, and it was deleted in 2026 along with the incremental
  redraw machinery it had been written for.
- **2022: a new backend.** Early in 2022 the Flask backend was rewritten as an
  async Sanic app with MongoDB and Redis: new Strava, Users, Index and Streams
  modules, a script to migrate users from the old PostgreSQL database, Strava
  webhook callbacks, OpenAPI docs, and activity streams encoded compactly for
  transfer and decoded in the browser. Work stopped in May 2022 with the new
  frontend not yet drawing anything.
- **2025: keeping the old app alive.** In late 2025 a Nix development
  environment was added, and the production app was moved from the retired
  heroku-18 stack to heroku-24.
- **September 2026: finishing it.** The rewrite was picked up again, with
  help from Claude, and finished in four days:
  - the WASM layer deleted and the dot animation connected, which it had
    never been on the new branch
  - activity streams cached in the browser, and MP4 recording
  - one MongoDB database (Redis dropped), Python 3.13 and Sanic 25.12
  - Strava requests paced by the rate-limit headers, imports that can be
    stopped from the browser, webhook payloads checked against Strava, and
    escaping for text from Strava and URLs
  - a backend test suite, a Dockerfile and Heroku's container stack

  On 2026-09-14 the new code became the main branch and went live on
  www.heatflask.com, with 3,740 users moved from PostgreSQL to MongoDB Atlas.

## [0.4.0-alpha] — 2020-07-16

The first tagged release, after four and a half years and about 2,100
commits. It was tagged as a snapshot of a stable app rather than something to
install: the next version was already planned to be quite different.

### How it got here

- **2016: a heatmap of one runner's data.** The repository started in March
  2016 as `running_data`, a script that turned Efrem's own Garmin Connect
  exports into a static heatmap. By the end of April it was a Flask app on
  Heroku drawing the map from points on request, and by June it was called
  Heatflask and drew with `leaflet.heat`.
- **Strava, and other people.** Strava login arrived in August–September
  2016, first through flask-oauthlib and then stravalib, and with it more than
  one user. The Garmin code was taken out that September.
- **The frontend was bundled by Python.** Frontend code was written by hand
  and bundled with Flask-Assets (webassets) from October 2016, minified with
  rjsmin and cssmin, and from April 2017 run through a Babel filter, all
  inside the Flask app. JavaScript modules and an npm build came later.
- **Where the data lived** moved around as the app grew: SQLite, then
  PostgreSQL through SQLAlchemy (May 2016), a Redis cache (October 2016), and
  MongoDB for activities and the index from December 2016, with msgpack for
  the cached data. Gunicorn ran gevent workers, and a Celery worker was tried
  and taken out again.
- **The dots.** The animation that became Heatflask's signature started in
  February 2017 as a canvas layer drawing dots along each track, later
  throttled to a target frame rate and tuned per zoom level.
- **Animated GIF export** of the map, with cropping to a selected area, in
  May–June 2017.
- **Webhooks and websockets.** Strava webhooks kept indexes current from
  February 2017 (reworked in 2018 and 2019), and activity queries moved to a
  binary websocket in 2018–2019, kept alive with a pinger.
- **Python 3** in December 2019, and web workers to project tracks off the
  main thread in January 2020. Map tiles were cached in IndexedDB for
  offline use in March 2020, and Flask-Limiter was added that month after
  what looked like denial-of-service traffic.

At the tag, the app was Flask with gevent and flask-sockets, Leaflet with the
canvas dot layer, and PostgreSQL, Redis and MongoDB behind it. Work on a
Parcel build for the frontend had started that March on a separate branch.

[1.7.4]: https://github.com/ebrensi/heatflask/compare/v1.7.3...v1.7.4
[1.7.3]: https://github.com/ebrensi/heatflask/compare/v1.7.2...v1.7.3
[1.7.2]: https://github.com/ebrensi/heatflask/compare/v1.0.0...v1.7.2
[1.0.0]: https://github.com/ebrensi/heatflask/releases/tag/v1.0.0
[0.4.0-alpha]: https://github.com/ebrensi/heatflask/releases/tag/v0.4.0-alpha
