# Heatflask backend
[![Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)

This is the server-side code for [Heatflask](https://www.heatflask.com ).  It is written in Python using the [Sanic](https://sanic.dev/en/guide/) framework.  I called the app Heatflask because it originally made heatmaps from [Strava](https://www.strava.com) data using Flask as the backend.  It made more sense to have an Async backend so I went with Sanic.

## Contributing
If you want to try your hand at Heatflask development, you will need to be able to test any changes you make on your own machine.  These instuctions assume you are using Linux.  I have not tried development on another OS. New to Linux? I recommend [Pop_OS!](https://system76.com/pop).

### Set up the backend environment
Fork this repo and clone it to your machine.   The backend runs on Python 3.13 (the floor is set by numpy 2.5, which requires 3.12+), with [MongoDB](https://www.mongodb.com) as its only datastore.

You will need [Nix](https://nixos.org). `nix develop` at the repo root gives you both, plus
helper commands (`heatflask-setup`, `heatflask-start-services`, `heatflask-run`).

Streams used to be cached in Redis in front of Mongo. That tier is gone: Mongo
is the only local cache, with a TTL index (`MONGO_STREAMS_TTL`, 10 days default)
doing the expiry that Redis keys used to do.

`heatflask-setup` does everything for you:
  * set up a Python 3 virtual environment in `backend/.venv/heatflask`
  * install all the python dependencies

It only creates the virtual environment if there isn't one, so after a change to `requirements.txt` either `pip install -r` it into the venv or delete `backend/.venv/heatflask` and run `heatflask-setup` again.

### Setup local environment variables
You will need a file in the [`/backend`](/backend/) directory called `.env`, that contains environment variables specific to your machine.  That file should only be on your machine, and not part of this repo.  There is a line in [`.gitignore`](/.gitignore) that excludes `.env` from the repo so you won't accidentally push it to Github.
Copy the template, [`.env.example`](/backend/.env.example), to `.env`. The template lists what you need to set and a few optional switches.


In order to access Strava you will need to have a Strava account, with an app defined.  [Here](https://developers.strava.com/docs/getting-started/) are the instructions for how to do that.  Strava will give you a client-id and a client-secret.  Include them in your `.env` file as

```bash
export STRAVA_CLIENT_ID="..."
export STRAVA_CLIENT_SECRET="..."
```

### Start the webserver
Start MongoDB with `heatflask-start-services`, then run the backend server with `heatflask-run`, which loads `backend/.env`.

It will serve at [`http://127.0.0.1:8000`](http://127.0.0.1:8000), but there will only be frontend code to serve if you have set up the frontend dev environment set up properly, so see [/frontend/README.md](/frontend/README.md).

If there are any problems getting this working, please create an [issue](https://github.com/ebrensi/heatflask/issues). Otherwise, Congratulations!🥳


### Code style guidelines
Python code is linted and formatted with [Ruff](https://docs.astral.sh/ruff/), which
replaced Flake8 and Black and produces byte-identical formatting to Black. It is
configured in [`pyproject.toml`](./pyproject.toml) and comes from the Nix dev shell,
so there is nothing to pip-install. The pre-commit hook formats staged files with it.


