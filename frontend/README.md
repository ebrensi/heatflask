# Heatflask frontend
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

This is the client-side code for [Heatflask](https://www.heatflask.com), which will run in the end-user's browser. It is written in plain "vanilla" JavaScript (ES6+). We assume the user is running a modern, up-to-date browser like Firefox or Chrome. We will not make any effort to support IE or any browser versioned over a couple of years old.

## Contributing

If you want to try your hand at Heatflask development, you will need to fork this repo and clone it to your machine. These instuctions assume you are using Linux. I have not tried development on another OS. New to Linux? I recommend [Pop_OS!](https://system76.com/pop).

### Set up frontend dev environment

You will need [npm](https://www.npmjs.com) (Node Package Manager) installed on your machine.

Specifications for frontend development are given in [`package.json`](/frontend/package.json), which is used by `npm` to create the environment and load in all the required packages.

Navigate to this ([`/frontend`](/frontend)) directory in a terminal and run

```bash
npm install
```

This will create a directory called `node_modules` and install all of the frontend dependencies into that directory. `node_modules` is set to be ignored by git (see [.gitignore](/.gitignore)) so those files won't be part of a commit.

For development, run `npm run watch` in the `/frontend` directory. That will call the [Parcel](https://v2.parceljs.org)(v2) bundler to build all the frontend modules and put the distrubution code into a few `.js` bundles (one for each HTML file) in a new directory called `/frontend/dist`, which is also ignored by Git.

`npm run watch` starts a daemon process that rebuilds the dependency bundles every time a file in [`/frontend/src`](/frontend/src) changes. For a one-time build, run `npm run build`.

Heatflask development typically involves two terminal windows. The backend server [`dev-run`](/backend/dev-run) running in [`/backend`](/backend)) and serving at `http://127.0.0.1:5000`, and the Parcel watcher (`npm run watch`) running in `/frontend`. With the backend server running and frontend dependecies built and bundled, you should be able to get Heatflask running in a browser at [`http://127.0.0.1:5000`](http://127.0.0.1:5000). If you don't have that set up yet, take a look at [`/backend/README.md`](/backend/README.md).

As long as the watcher is running, whatever changes you make to files in [`/frontend/src`](/frontend/src) will be reflected at [`http://127.0.0.1:5000`](http://127.0.0.1:5000). Browser developer tools are available in most browsers (Chrome, Firefox, Safari) with the shortcut `ctrl-shift-i`.

If there are any problems getting this working, please create an [issue](https://github.com/ebrensi/heatflask/issues). Otherwise, Congratulations!🥳

### Make a pull request

If you make some changes to the code and have tested it on your machine, you can make a pull request. See [/contributing.md](/contributing.md).
