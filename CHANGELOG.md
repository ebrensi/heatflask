# Changelog

Notable changes to Heatflask, newest first. Version numbers follow
[docs/VERSIONING.md](docs/VERSIONING.md): they track the map URL's parameters,
so a minor or patch release never breaks a saved link. Versions between the
sections below were tagged without release notes; each section covers
everything since the one before it.

## Unreleased

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

[1.7.2]: https://github.com/ebrensi/heatflask/compare/v1.0.0...v1.7.2
[1.0.0]: https://github.com/ebrensi/heatflask/releases/tag/v1.0.0
[0.4.0-alpha]: https://github.com/ebrensi/heatflask/releases/tag/v0.4.0-alpha
