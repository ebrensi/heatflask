web: gunicorn heatmapp:app --worker-class gevent --timeout 60 --log-file=-
worker: celery worker --app=heatmapp.celery -P gevent --loglevel=INFO
