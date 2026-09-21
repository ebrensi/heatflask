# Contributing to Heatflask
### tl;dr
If you mostly know what you are doing and you are on a Linux based operating system,
  * install [Nix](https://nixos.org), clone this repo, and in the root of the repo run `nix develop`, which provides MongoDB, Python 3.13 and Node, then `heatflask-setup`.  It installs everything, and a pre-commit hook that formats what you commit.

  * copy [`backend/.env.example`](./backend/.env.example) to `backend/.env` and put your Strava app credentials in it (see [`backend/README.md`](./backend/README.md)), then start MongoDB with `heatflask-start-services` and the server with `heatflask-run`, which loads that file for you.

  * `heatflask-frontend-watch` builds the frontend TypeScript and rebuilds it as you modify the frontend files; `heatflask-frontend-build` builds it once.  See [`./frontend/package.json`](./frontend/package.json).


## Contributor terms

Patches are welcome. Before I can merge one, I need two things from you, both
of which are covered by a single line in your commit.

**1. Sign off on your commits.** Commit with `git commit -s`, which appends a
`Signed-off-by:` line. That line means you certify the
[Developer Certificate of Origin](https://developercertificate.org) (also kept
in [`/DCO`](./DCO)): in short, that the work is yours to give, or that you
received it under a compatible license, and that you understand the
contribution and your name are a matter of public record.

**2. Contributions are licensed to the project, and to me, on these terms.**
By submitting a contribution you license it under
[AGPL-3.0-or-later](./LICENSE) like the rest of Heatflask, and you also grant
me (Efrem Rensi) a perpetual, worldwide, non-exclusive, royalty-free,
irrevocable and sublicensable license to use, reproduce, modify and distribute
your contribution, **including the right to license it under terms other than
the AGPL**. You keep the copyright in what you wrote; this is a license to me,
not a transfer.

That second point exists for a specific and narrow reason. Heatflask is
AGPL-licensed, which does not suit every company that might want to use the
code, so I offer commercial licenses on request. I can only do that for code I
hold the rights to relicense. Without this grant, a single merged patch would
make that impossible for the whole project, and I would have to turn
contributions away. It does not let me take Heatflask itself proprietary: every
version released under the AGPL stays available under the AGPL, permanently, to
everyone.

## Code Style Guidelines
### Client-side (frontend)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

Front-end code is TypeScript. It is typechecked with `npm run typecheck`, linted with [ESLint](https://eslint.org), and auto-formatted with [Prettier](https://prettier.io).

When you install frontend dependencies with `npm install`, TypeScript, ESLint and Prettier are installed for you as dev-dependencies and convenient `npm` scripts to use them are defined in [`package.json`](/frontend/package.json). You can then integrate it with whatever IDE you like.

### Server-side (backend)
[![Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)

Python code is linted and auto-formatted with [Ruff](https://docs.astral.sh/ruff/), a
single tool in place of Flake8 and Black. Its rule selection is deliberately Flake8's,
and its formatter is a drop-in for Black, so nothing about the house style changed when
it replaced them. Configuration lives in [`backend/pyproject.toml`](/backend/pyproject.toml),
alongside the pytest and mypy settings.

Ruff, pytest, mypy and pdoc are provided by the Nix dev shell rather than by a
`requirements-dev.txt`, which no longer exists. `backend/requirements.txt` is only the
application's runtime dependencies, and is what the Dockerfile installs.

Run the backend tests with `heatflask-test` inside `nix develop`.


## Versioning

The version number lives in [`/VERSION`](./VERSION) and is bumped by hand. It
makes a promise about the parameters in a map's URL — the links people have
saved — and about nothing else; [`docs/VERSIONING.md`](./docs/VERSIONING.md) says
what a bump means and how to cut a release.
