import os
import time
from string import Template
from logging import getLogger

# for serving static files (relative to where webserver is run)
FRONTEND_DIST_DIR = "../frontend/dist/"

log = getLogger("server.files")
log.propagate = True


def init_app(app):
    # Any get request for a file at the root of the
    # server domain will attempt to serve that file from
    # FRONTEND_DIST_DIR, unless there is an endpoint
    # with that name.
    # ex.  /logo.png  ->  we serve FRONTEND_DIST_DIR/logo.png
    #
    # The url for the file can be generated as
    # app.url_for("static", name="dist", filename="logo.png")
    #
    app.static("/", FRONTEND_DIST_DIR, name="dist")
    app.register_listener(load_templates, "before_server_start")


TEMPLATE_FILES = [
    "admin.html",
    "events.html",
    "index-view.html",
    "main.html",
    "splash.html",
]

templates = {}


async def load_templates(app, loop):
    # We pre-load all of the templates as strings and serve them
    # from memory with values substituted in at serve-time
    # using Python's built-in string.Template library.
    #
    # This is faster than using a Templating library like Jinja2
    # since we don't need any of its advanced features.
    for fname in TEMPLATE_FILES:
        fpath = f"{FRONTEND_DIST_DIR}{fname}"
        if not os.path.isfile(fpath):
            log.error("can't find template file %s", fpath)
            continue
        with open(fpath, "r") as file:
            file_str = file.read()
        templates[fname] = Template(file_str)
        log.debug("Created string template from %s", fname)


def render_template(filename, **kwargs):
    t = templates[filename]
    html = t.safe_substitute(**kwargs)
    return html
