#! usr/bin/env bash

source activate runapp

export DATABASE_URL=postgresql://heatmapp:heatmapp@localhost/heatmapp
export REDIS_URL=redis://localhost
export MONGODB_URI=mongodb://localhost

export SERVER_NAME=localhost
export FLASK_APP=heatmapp.py
export FLASK_DEBUG=1

export STRAVA_CLIENT_ID="12700"
export STRAVA_CLIENT_SECRET="04d0fffe327fa71bffcbb4c9bc00c26a0d530e4b"

# The local evironment is the development enironment
export APP_SETTINGS="config.DevelopmentConfig"
