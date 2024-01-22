# wsgi.py
#  this is run by gunicorn

from gevent import pywsgi
from geventwebsocket.handler import WebSocketHandler
from datetime import timedelta
import logging

from heatflask.app import create_app, limiter


if __name__ == "__main__":
    app = create_app()

    log = app.logger

    gunicorn_logger = logging.getLogger("gunicorn.error")
    handlers = gunicorn_logger.handlers or log.handlers

    for handler in handlers:
        limiter.logger.addHandler(handler)

        formatter = handler.setFormatter(
            logging.Formatter("%(process)d %(levelname).1s %(message)s")
        )

    log.handlers = handlers
    log_level_name = app.config["LOG_LEVEL"]
    log_level = logging.getLevelName(log_level_name)
    log.setLevel(log_level)

    loc_status = ""
    if app.config.get("OFFLINE"):
        loc_status = " OFFLINE"
    elif app.config.get("USE_REMOTE_DB"):
        loc_status = " USING REMOTE DATA-STORES"

    keys = {"TTL_INDEX", "TTL_DB", "TTL_CACHE"}
    ttls = {s: "{}".format(timedelta(seconds=app.config[s])) for s in keys}

    log.info(
        "Heatflask server starting%s LOG_LEVEL=%s: %s", loc_status, log_level_name, ttls
    )

    server = pywsgi.WSGIServer(("", 5000), app, handler_class=WebSocketHandler)
    server.serve_forever()
