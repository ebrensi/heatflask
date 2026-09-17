# Contributing to Heatflask
### tl;dr
If you mostly know what you are doing and you are on a Linux based operating system,
  * install MongoDB and Python 3.13 (or run `nix develop` in the root of the repo, which provides both)

  * clone this repo, and in the root of the repo, run [`.dev-setup`](./.dev-setup), which should be executable.  It should install everything.

  * put your Strava app credentials in `backend/activate` (see [`backend/README.md`](./backend/README.md)), then start the server with [`backend/dev-run`](./backend/dev-run), which loads that file for you.

  * to build and bundle the frontend TypeScript, navigate to [`/frontend`](./frontend/) and run `npm run build`.  See [`./frontend/package.json`](./frontend/package.json).  `npm run watch` to start a process that rebuilds as you modify the frontend files.


## Code Style Guidelines
### Client-side (frontend)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

Front-end code is TypeScript. It is typechecked with `npm run typecheck`, linted with [ESLint](https://eslint.org), and auto-formatted with [Prettier](https://prettier.io).

When you install frontend dependencies with `npm install`, TypeScript, ESLint and Prettier are installed for you as dev-dependencies and convenient `npm` scripts to use them are defined in [`package.json`](/frontend/package.json). You can then integrate it with whatever IDE you like.

### Server-side (backend)
[![Code style: black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black)

The code in this repo conforms to [Flake8](https://flake8.pycqa.org/en/latest/#) lint rules and is auto-formatted with [Black](https://black.readthedocs.io/en/stable).


## Versioning

The version number lives in [`/VERSION`](./VERSION) and is bumped by hand. It
makes a promise about the parameters in a map's URL — the links people have
saved — and about nothing else; [`docs/VERSIONING.md`](./docs/VERSIONING.md) says
what a bump means and how to cut a release.
