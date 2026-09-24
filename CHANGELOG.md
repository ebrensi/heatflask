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

The first tagged release of the original app.

[1.7.2]: https://github.com/ebrensi/heatflask/compare/v1.0.0...v1.7.2
[1.0.0]: https://github.com/ebrensi/heatflask/releases/tag/v1.0.0
[0.4.0-alpha]: https://github.com/ebrensi/heatflask/releases/tag/v0.4.0-alpha
