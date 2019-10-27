#!/bin/bash

source .env

gunicorn heatflask:app --workers 2 --worker-class flask_sockets.worker --bind '127.0.0.1:5000'  --log-file=-
