#! usr/bin/env bash

source activate runapp

export DATABASE_URL=postgresql://heatmapp:heatmapp@localhost/heatmapp
export FLASK_APP=heatmapp.py
export FLASK_DEBUG=1

