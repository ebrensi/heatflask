web: gunicorn wsgi:app --workers 3 --worker-class flask_sockets.worker --timeout 20 --preload --log-level=debug

