# Developer Onboarding

Here are instructions for anyone who wants to run a fork of this repo independently.

You will need to have Postgres, MongoDB, and Redis installed on your machine and/or have URLs for them.

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


For running Flask locally on your machine, 
```
# Local Flask settings
export SERVER_NAME=localhost
export FLASK_APP=heatflask.py
export FLASK_DEBUG=1
```

There is the option of chosing between local and remote data-stores. Set the URIs for these as
`REMOTE_POSTGRES_URL`, `REMOTE_MONGODB_URL`, `REMOTE_REDIS_URL`

and enable them with environment variable `export USE_REMOTE_DB=1`

If you want to run the server completely offline on your machine, set the environment variable
`export OFFLINE=1`


Finally, in your `.env` file (or somewhere) you need to have a Python environment with all the dependencies from `requirements.txt`.


If you have heroku-cli, everything is set up for you to start the server with `heroku local`.

Otherwise, in a shell with the environment described above, execute the `dev-run.sh` script.
 


