from heatflask import create_app
from signal import signal, SIGPIPE, SIG_DFL
import logging

app = create_app()

gunicorn_logger = logging.getLogger('gunicorn.error')
app.logger.handlers = gunicorn_logger.handlers
app.logger.setLevel(gunicorn_logger.level)

loc_status = ""
if app.config.get("OFFLINE"):
    loc_status = ": OFFLINE"
elif app.config.get("USE_REMOTE_DB"):
    loc_status = ": USING REMOTE DATA-STORES"

log = app.logger
log.info("Heatflask server starting{}".format(loc_status))

# makes python ignore sigpipe and prevents broken pipe exception when client
#  aborts an SSE stream by closing the browser window
signal(SIGPIPE, SIG_DFL)

# if __name__ == '__main__':
#     from gevent import pywsgi
#     from geventwebsocket.handler import WebSocketHandler
#     server = pywsgi.WSGIServer(('', 5000), app, handler_class=WebSocketHandler)
#     server.serve_forever()
