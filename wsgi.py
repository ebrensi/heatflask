# wsgi.py
#  this is run by gunicorn

from heatflask import create_app
# from signal import signal, SIGPIPE, SIG_DFL
import logging

app = create_app()

log = app.logger
gunicorn_logger = logging.getLogger('gunicorn.error')
handlers = gunicorn_logger.handlers

for handler in handlers:
    formatter = handler.setFormatter(logging.Formatter(
        '[%(process)d] [%(levelname)s] %(message)s'
    ))

app.logger.handlers = handlers
log_level_name = app.config["LOG_LEVEL"]
log_level = logging.getLevelName(log_level_name)
app.logger.setLevel(log_level)

loc_status = ""
if app.config.get("OFFLINE"):
    loc_status = " OFFLINE"
elif app.config.get("USE_REMOTE_DB"):
    loc_status = " USING REMOTE DATA-STORES"

log.info(
    "Heatflask server starting%s LOG_LEVEL=%s",
    loc_status,
    log_level_name
)

# makes python ignore sigpipe and prevents broken pipe exception when client
#  aborts an SSE stream by closing the browser window

# signal(SIGPIPE, SIG_DFL)

