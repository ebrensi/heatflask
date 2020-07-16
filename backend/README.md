# Heatflask backend
This is the server-side code for [Heatflask](https://www.heatflask.com ).  It is written in Python using the [Flask](https://flask.palletsprojects.com/en/1.1.x) framework.  I called the app Heatflask because it originally made heatmaps from [Strava](https://www.strava.com) data using Flask as the backend.  Flask is getting a little dated and I am open to moving to a different platform, or even a different language.  For now the Flask backend is pretty stable and runs itself without much intervention.

## Contributing
If you want to try your hand at Heatflask development, fork this repo and clone it to your machine.  These instuctions assume you are using Linux.  I have not tried development on another OS. New to Linux? I recommend [Pop_OS!](https://system76.com/pop). The backend currently runs on Python 3.8. You will need installed on your machine:
  * A Python 3.8.2 environment
  * [Redis](https://redis.io) Fast in-memory datastore (backend cache)
  * [MongoDB](https://www.mongodb.com) NoSQL database (Activities database)
  * [Postgres](https://www.postgresql.org) SQL database (User database).  There should be a `heatflask` database with user `heatflask` with password "heatflask".
  
I'm assuming you know how to get that set up. To install the backend dependencies on your machine, navigate to the `backend` directory.  Make sure your Python 3.8 environment is activated.  Then install all the backend dependencies with
```
pip install -r requirements-dev.txt
pip install -r requirements.txt
```

You will need to have a shell script in the `/backend` directory called `.env`, that contains environment variables specific to your machine:
Here is an example:

```bash
#! usr/bin/env bash

# *************************************************************************
#  heatflask app expects the following variables to be in the environment
#
# The local evironment is the development enironment

export APP_SETTINGS="config.DevelopmentConfig"
export SECRET_KEY="whatever you want here"


# data-store URIs
export DATABASE_URL="postgresql://heatflask:heatflask@localhost/heatflask"
export REDIS_URL="redis://localhost"
export MONGODB_URI="mongodb://localhost/heatflask"

# To be able to access Strava data
export STRAVA_CLIENT_ID="this will be unique to you"
export STRAVA_CLIENT_SECRET="this too"

# ***************************************************************************
# Local Flask settings (unnecessary if you use gunicorn)
export SERVER_NAME="0.0.0.0:5000"
export FLASK_APP="{this will be different on your machine}/Heatflask/backend/heatflask/wsgi.py"
export FLASK_ENV=development
export LOG_LEVEL=DEBUG

export GUNICORN_CMD_ARGS="--reload --worker-class flask_sockets.worker --log-level=debug --bind '0.0.0.0:5000'"

# export OFFLINE=1
```

In order to access Strava you will need to have a Strava account, with an app defined.  [Here](https://developers.strava.com/docs/getting-started/) are the instructions for how to do that.  Strava will give you a client-id and a client-secret.  Include them in your `.env` file as 

```
export STRAVA_CLIENT_ID="...""
export STRAVA_CLIENT_SECRET="..."
```  

The environment has to specify to the Flask app what kind of environment it is running in: Development, Staging, or Production. See [`config.py`](https://github.com/ebrensi/heatflask/blob/ebrensi-patch-2/backend/config.py).

For the development environment, which is what you are, 
```
export APP_SETTINGS="config.DevelopmentConfig"
```

In order to access MapBox baselayers, your environment needs to have an access token
```
export MAPBOX_ACCESS_TOKEN=...(your access token)
```
which you can get from [here](https://docs.mapbox.com/help/how-mapbox-works/access-tokens).


If you want to run the server completely offline on your machine, set the environment variable
`export OFFLINE=1`


Finally, in your `.env` file (or somewhere) you need to have activated a Python environment with all the dependencies from `requirements.txt`.

Otherwise, in a shell with the environment described above, execute the `dev-run` script.
 



Then, you should be able to run the backend server on your machine by running [`dev-run`](https://github.com/ebrensi/heatflask/blob/ebrensi-patch-1/dev-run)

It will serve at [`http://127.0.0.1:5000`](http://127.0.0.1:5000), but there will only be frontend code to serve if you have set up the [frontend](https://github.com/ebrensi/heatflask/tree/bundle/frontend) set up properly.


