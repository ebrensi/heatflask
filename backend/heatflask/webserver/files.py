import os
import html
import json
from string import Template
from logging import getLogger

from sanic import Sanic
from typing import Any

# for serving static files (relative to where webserver is run)
FRONTEND_DIST_DIR = "../frontend/dist"

log = getLogger(__name__)
log.setLevel("INFO")
log.propagate = True


def init_app(app: Sanic):
    # Any get request for a file at the root of the
    # server domain will attempt to serve that file from
    # FRONTEND_DIST_DIR, unless there is an endpoint
    # with that name.
    # ex.  /logo.png  ->  we serve FRONTEND_DIST_DIR/logo.png
    app.static("", FRONTEND_DIST_DIR, name="dist")

    app.static("docs/b", f"{FRONTEND_DIST_DIR}/docs/backend", name="bdocs")
    app.static("docs/f", f"{FRONTEND_DIST_DIR}/docs/frontend", name="fdocs")

    app.register_listener(load_templates, "before_server_start")


templates: dict[str, Template] = {}


# Takes only `app`: Sanic 26.6 removes the `loop` argument to listeners
async def load_templates(app: Sanic):
    # We pre-load all of the templates as strings and serve them
    # from memory with values substituted in at serve-time
    # using Python's built-in string.Template library.
    #
    # This is faster than using a Templating library like Jinja2
    # since we don't need any of its advanced features.
    loaded: dict[str, Template] = {}
    for fname in os.listdir(FRONTEND_DIST_DIR):
        if fname.endswith(".html"):
            fpath = f"{FRONTEND_DIST_DIR}/{fname}"
            with open(fpath, "r") as file:
                file_str = file.read()
            loaded[fname] = Template(file_str)
            log.debug("Created string template from %s", fname)

    if not loaded and templates:
        # A frontend build empties dist/ before writing to it, and auto_reload
        # watches that same directory -- so a reload can land mid-build, when
        # there is no html to read. Keep what we already have rather than
        # replacing it with nothing and then serving KeyError 500s until the
        # next reload happens to arrive.
        log.warning(
            "no templates found in %s (build in progress?); keeping the %d already loaded",
            FRONTEND_DIST_DIR,
            len(templates),
        )
        return

    templates.clear()
    templates.update(loaded)


def read_template(filename: str) -> Template | None:
    """Read one template off disk, or None if it is not there."""
    try:
        with open(f"{FRONTEND_DIST_DIR}/{filename}", "r") as file:
            return Template(file.read())
    except OSError:
        return None


def render_template(filename: str, **kwargs: Any) -> str:
    """
    Fill a template's ${placeholders}. Every value is HTML-escaped.

    Values used to go into the page raw, and they include text from Strava --
    runtime_json carries athletes' names, and flashes can quote a URL
    parameter (auth_callback flashes "Error: <the error arg>"). A name or an
    error of "</div><script>...</script>" ran as script on heatflask.com for
    whoever loaded the page. The pages read these elements back with
    innerText/textContent, which decodes the entities, so JSON.parse still
    sees exactly what was sent.
    """
    for key, val in kwargs.items():
        if isinstance(val, dict):
            val = json.dumps(val, indent=2)
        kwargs[key] = html.escape(str(val))

    t = templates.get(filename)
    if t is None:
        # Not cached. The likely reason is that this worker started while a
        # frontend build had emptied dist/, so load_templates found nothing --
        # and auto_reload restarts the process, so there is no previous cache
        # to fall back on. Read it now instead of serving a 500 until some
        # later reload happens along.
        t = read_template(filename)
        if t is None:
            raise KeyError(f"no template {filename} in {FRONTEND_DIST_DIR}")
        templates[filename] = t
        log.info("loaded template %s on demand", filename)

    return t.safe_substitute(**kwargs)
