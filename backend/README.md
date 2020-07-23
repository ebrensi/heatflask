# Heatflask backend
[![Code style: black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black)

This is the server-side code for [Heatflask](https://www.heatflask.com ).  It is written in Python using the [Flask](https://flask.palletsprojects.com/en/1.1.x) framework.  I called the app Heatflask because it originally made heatmaps from [Strava](https://www.strava.com) data using Flask as the backend.  Flask is getting a little dated and I am open to moving to a different platform, or even a different language.  For now the Flask backend is pretty stable and runs itself without much intervention.

## Contributing
If you want to try your hand at Heatflask development, you will need to be able to test any changes you make on your own machine.  These instuctions assume you are using Linux.  I have not tried development on another OS. New to Linux? I recommend [Pop_OS!](https://system76.com/pop).

### Set up the backend environment
Fork this repo and clone it to your machine.   The backend currently runs on Python 3.8. You will need installed on your machine:
  * A Python 3.8.x environment. [This](https://docs.python.org/3/library/venv.html) describes one way to do it.
    * For example, to create a python 3.8 environment called `heatflask-dev` in a directory called `~/.venv`, make sure you have Python 3.8 installed. Then `python3 -m venv ~/.venv/heatflask-dev`.  The vitrual-environment directory should not be included in this repo!
  * [Redis](https://redis.io) Fast in-memory datastore (backend cache)
  * [MongoDB](https://www.mongodb.com) NoSQL database (Activities database)
  * [Postgres](https://www.postgresql.org) SQL database (User database).  There should be a `heatflask` database with user `heatflask` with password "heatflask".

### Install Python dependencies
Now to install the backend dependencies on your machine. Navigate to the `backend` directory.  Make sure your Python 3.8 environment is activated.  Then install all the backend dependencies with
```
pip install -r requirements-dev.txt
pip install -r requirements.txt
```

### Setup local environment variables
You will need to have a shell script in the `[/backend](/backend/)` directory called `.env`, that contains environment variables specific to your machine.  That file should only be on your machine, and not part of this repo.
There is a template file already set up for you, called [`.env.tmp`](/backend/.env.tmp).  Rename it to `.env` and include the missing information.

Unless you want to manually activate the dev environment every time, have a line to do that. If you created an envrinment as suggested above, the line will be
```bash
source ~/.venv/heatflask-dev/bin/activate
```


In order to access Strava you will need to have a Strava account, with an app defined.  [Here](https://developers.strava.com/docs/getting-started/) are the instructions for how to do that.  Strava will give you a client-id and a client-secret.  Include them in your `.env` file as

```bash
export STRAVA_CLIENT_ID="...""
export STRAVA_CLIENT_SECRET="..."
```

The environment has to specify to the Flask app what kind of environment it is running in: Development, Staging, or Production. See [`config.py`](/backend/config.py).

For the development environment, which is what you will have,
```bash
export APP_SETTINGS="config.DevelopmentConfig"
```

In order to access MapBox baselayers, your environment needs to have an access token
```bash
export MAPBOX_ACCESS_TOKEN=...(your access token)
```
which you can get from [here](https://docs.mapbox.com/help/how-mapbox-works/access-tokens).


### Start the webserver
You should be able to run the backend server on your machine by running [`dev-run`](/backend/dev-run)

It will serve at [`http://127.0.0.1:5000`](http://127.0.0.1:5000), but there will only be frontend code to serve if you have set up the frontend dev environment set up properly, so see [/frontend/README.md](/frontend/README.md).

If there are any problems getting this working, please create an [issue](https://github.com/ebrensi/heatflask/issues). Otherwise, Congratulations!🥳

### Make a pull request
If you make some changes to the code and have tested it on your machine, you can make a pull request. See [/contributing.md](/contributing.md).



