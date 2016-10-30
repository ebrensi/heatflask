web: gunicorn heatmapp:app --log-file=-
worker: celery worker --app=heatmapp.celery --loglevel=INFO
