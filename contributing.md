# Contributing to Heatflask

Here are instructions for anyone who wants to run a fork of this repo independently.

You will need to have access to Postgres, MongoDB, and Redis data-stores, installed on your machine and/or cloud service.

In order for the app to access them, you will need to set these shell environment variables:
(In a linux environment, this is typically done in a local file called `.env`.)

```
export DATABASE_URL="postgresql:..."
export REDIS_URL="redis:..."
export MONGODB_URI="mongodb:..."
```

In order to access Strava you will need to have a normal Strava athlete account, with an app defined so that you have

```
export STRAVA_CLIENT_ID="...""
export STRAVA_CLIENT_SECRET="..."
```  

You will need to specify to the app what kind of environment this is: Development, Staging, or Production. See `config.py`.
For a development environment, 
```
export APP_SETTINGS="config.DevelopmentConfig"
```

If you wish to identify the ip addresses of visitors, this app uses IP-Stack.
```
export IPSTACK_ACCESS_KEY="..."
```

In order to access MapBox baselayers, your environment needs to have an access token
```
export MAPBOX_ACCESS_TOKEN=...(your access token)
```

For running Flask locally on your machine, 
```
# Local Flask settings
export SERVER_NAME=localhost
export FLASK_APP=heatflask.py
export FLASK_DEBUG=1
```

You have the option of chosing between "local" (`DATABASE_URL`, `REDIS_URL`, `MONGODB_URI`) and "remote" data-stores, referenced by variables `REMOTE_POSTGRES_URL`, `REMOTE_MONGODB_URL`, and `REMOTE_REDIS_URL`.

and enable them with environment variable `export USE_REMOTE_DB=1`

If you want to run the server completely offline on your machine, set the environment variable
`export OFFLINE=1`


Finally, in your `.env` file (or somewhere) you need to have activated a Python environment with all the dependencies from `requirements.txt`.


If you have heroku-cli, everything is set up for you to start the server with `heroku local`.

Otherwise, in a shell with the environment described above, execute the `dev-run.sh` script.
 


Feel free to [contact me](mailto:info@heatflask.com) with any questions!
