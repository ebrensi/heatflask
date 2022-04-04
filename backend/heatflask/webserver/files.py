import os
import json
from string import Template
from logging import getLogger

# for serving static files (relative to where webserver is run)
FRONTEND_DIST_DIR = "../frontend/dist/"

log = getLogger(__name__)
log.propagate = True


def init_app(app):
    # Any get request for a file at the root of the
    # server domain will attempt to serve that file from
    # FRONTEND_DIST_DIR, unless there is an endpoint
    # with that name.
    # ex.  /logo.png  ->  we serve FRONTEND_DIST_DIR/logo.png
    app.static("", FRONTEND_DIST_DIR, name="dist")
    app.register_listener(load_templates, "before_server_start")


templates = {}


async def load_templates(app, loop):
    # We pre-load all of the templates as strings and serve them
    # from memory with values substituted in at serve-time
    # using Python's built-in string.Template library.
    #
    # This is faster than using a Templating library like Jinja2
    # since we don't need any of its advanced features.
    for fname in os.listdir(FRONTEND_DIST_DIR):
        if fname.endswith(".html"):
            fpath = f"{FRONTEND_DIST_DIR}{fname}"
            with open(fpath, "r") as file:
                file_str = file.read()
            templates[fname] = Template(file_str)
            log.debug("Created string template from %s", fname)


def render_template(filename, **kwargs):
    for key, val in kwargs.items():
        if isinstance(val, dict):
            kwargs[key] = json.dumps(val, indent=2)

    t = templates[filename]
    html = t.safe_substitute(**kwargs)
    return html
