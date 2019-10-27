#!/bin/bash
# This runs a development server with gunicorn.
#  You need a .env file that sets the python (virtualenv, conda, etc) and shell environments.
#  See dev-setup.md

source .env

gunicorn heatflask:app --workers 2 --worker-class flask_sockets.worker --bind '127.0.0.1:5000'  --log-file=-
