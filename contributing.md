# Contributing to Heatflask
### tl;dr
If you mostly know what you are doing and you are on a Linux based operating system,
  * install MongoDB, Redis, Python3.10 latest versions

  * clone this repo, and in the root of the repo, run [`.dev-setup`](./.dev-setup), which should be executable.  It should install everything.
  
  * to start the backend server, navigate to [`/backend`](./backend/), activate the venv by running `source activate`, then start the server with [`./dev-run`](./backend/dev-run).

  * to build and bundle the frontend TypesScript into js and wasm, navigate to [`/frontend`](./frontend/) and run `npm run build`.  See [`./frontend/package.json`](./frontend/package.json).  `npm run watch` to start a process that rebuilds as you modify the frontend files.


## Code Style Guidelines
### Client-side (frontend)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

Front-end code conforms to [ESLint](https://eslint.org) "recommended" config rules and is auto-formatted with [Prettier](https://prettier.io).

When you install frontend dependencies with `npm install`, ESLint and Prettier are installed for you as a dev-dependencies and convenient `npm` scripts to use them are defined in [`package.json`](/frontend/package.json). You can then integrate it with whatever IDE you like.

### Server-side (backend)
[![Code style: black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black)

The code in this repo conforms to [Flake8](https://flake8.pycqa.org/en/latest/#) lint rules and is auto-formatted with [Black](https://black.readthedocs.io/en/stable).

