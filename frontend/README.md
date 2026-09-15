# Heatflask frontend
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

This is the client-side code for [Heatflask](https://www.heatflask.com), which will run in the end-user's browser. It is written in TypeScript, on [MapLibre GL JS](https://maplibre.org) with a WebGL layer of its own for the animation, and bundled with [Parcel](https://parceljs.org). We assume the user is running a modern, up-to-date browser like Firefox or Chrome. We will not make any effort to support IE or any browser versioned over a couple of years old.

## Contributing

### Set up frontend dev environment
Note: The [`.dev-setup`](/.dev-setup) script does this all for you.

You will need [Node.js](https://nodejs.org) 22 or newer, which comes with [npm](https://www.npmjs.com). `nix develop` in the root of the repo provides it.

Specifications for frontend development are given in [`package.json`](/frontend/package.json), which is used by `npm` to create the environment and load in all the required packages.

Navigate to this ([`/frontend`](/frontend)) directory in a terminal and run

```bash
npm ci --ignore-scripts
```

`--ignore-scripts` because the native modules the build needs ship prebuilt binaries, and some dependencies install scripts that try to build things that no longer build on current Node.

This will create a directory called `node_modules` and install all of the frontend dependencies into that directory. `node_modules` is set to be ignored by git (see [.gitignore](/.gitignore)) so those files won't be part of a commit.

For development, run `npm run watch` in the `/frontend` directory. That will call the [Parcel](https://v2.parceljs.org)(v2) bundler to build all the frontend modules and put the distrubution code into a few `.js` bundles (one for each HTML file) in a new directory called `/frontend/dist`, which is also ignored by Git.

`npm run watch` starts a daemon process that rebuilds the dependency bundles every time a file in [`/frontend/src`](/frontend/src) changes. For a one-time build, run `npm run build`. `npm run typecheck` runs the TypeScript compiler over everything.
