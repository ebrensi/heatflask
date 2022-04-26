# Heatflask backend
[![Code style: black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black)

This is the server-side code for [Heatflask](https://www.heatflask.com ).  It is written in Python using the [Sanic](https://sanic.dev/en/guide/) framework.  I called the app Heatflask because it originally made heatmaps from [Strava](https://www.strava.com) data using Flask as the backend.  It made more sense to have an Async backend so I went with Sanic.

## Contributing
If you want to try your hand at Heatflask development, you will need to be able to test any changes you make on your own machine.  These instuctions assume you are using Linux.  I have not tried development on another OS. New to Linux? I recommend [Pop_OS!](https://system76.com/pop).

### Set up the backend environment
Fork this repo and clone it to your machine.   The backend currently runs on Python 3.8. You will need installed on your machine:
  * A Python 3 (3.8+)
  * [Redis](https://redis.io) Fast in-memory datastore (backend cache)
  * [MongoDB](https://www.mongodb.com) NoSQL database (Activities database)
On some Linux systems Mongo may be installed but the service is not started.  Make sure the MongoDB daemon is running.
The setup used to be more complicated but now there is a convenient script [`.dev-install-backend`](/backend/.dev-install-backend)

Running that should do everything for you:
  * set up a Python 3 virtual environment in `backend/.venv/heatflask`
  * install all the python dependencies

### Setup local environment variables
You will need to have a shell script in the [`/backend`](/backend/) directory called `activate`, that contains environment variables specific to your machine.  That file should only be on your machine, and not part of this repo.  There is a line in [`.gitignore`](/.gitignore) that excludes `activate` from the repo so you won't accidentally push it to Github.
There is a template file already set up for you, called [`.env.tmp`](/backend/.env.tmp).  The `dev-install-backend` script should rename `.env.tmp` to `activate` after it completes.


In order to access Strava you will need to have a Strava account, with an app defined.  [Here](https://developers.strava.com/docs/getting-started/) are the instructions for how to do that.  Strava will give you a client-id and a client-secret.  Include them in your `source activate` file as

```bash
export STRAVA_CLIENT_ID="...""
export STRAVA_CLIENT_SECRET="..."
```

### Start the webserver
You should be able to run the backend server on your machine by running [`dev-run`](/backend/dev-run)

It will serve at [`http://127.0.0.1:8000`](http://127.0.0.1:8000), but there will only be frontend code to serve if you have set up the frontend dev environment set up properly, so see [/frontend/README.md](/frontend/README.md).

If there are any problems getting this working, please create an [issue](https://github.com/ebrensi/heatflask/issues). Otherwise, Congratulations!🥳


### Code style guidelines
We use [Flake8](https://flake8.pycqa.org/en/latest/#) linter and [Black](https://black.readthedocs.io/en/stable) formatting.


