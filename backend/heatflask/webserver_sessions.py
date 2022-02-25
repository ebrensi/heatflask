from logging import getLogger
import functools
import json

import Users
from webserver_config import APP_NAME
import webserver_files

log = getLogger("server.sessions")

#
# Persistent Sessions (via cookie)
#
# When a user "logs-in" we put a cookie in their browser
# that consists of their user_id.   That way the next time they
# come to our app they will still be logged in, unless they log-out.
DEFAULT_COOKIE_SPEC = {
    # "expires": None,
    # "path": None,
    # "comment": None,
    # "domain": None,
    "max-age": 10 * 24 * 3600,  # 10 days
    # "secure": False,
    "httponly": True,
    # "samesite": "strict",
}

COOKIE_NAME = APP_NAME


# attach middleware to Sanic app to check the cookie from every request and
#  add a cookie to every response
def init_app(app):
    app.register_middleware(fetch_session_from_cookie, "request")
    app.register_middleware(reset_or_delete_cookie, "response")
    app.register_middleware(attach_flash_handlers, "request")


def set_cookie(response, session):
    response.cookies[COOKIE_NAME] = json.dumps(session)
    response.cookies[COOKIE_NAME].update(DEFAULT_COOKIE_SPEC)
    log.debug("set '%s' cookie %s", COOKIE_NAME, response.cookies[COOKIE_NAME])


def delete_cookie(request, response):
    if request.cookies.get(COOKIE_NAME):
        del response.cookies[COOKIE_NAME]
        log.debug("deleted '%s' cookie", COOKIE_NAME)


async def fetch_session_from_cookie(request):
    cookie_value = request.cookies.get(COOKIE_NAME)
    if not cookie_value:
        log.debug("No session cookie")

    request.ctx.session = json.loads(cookie_value) if cookie_value else {}

    user_id = request.ctx.session.get("user")
    request.ctx.current_user = await Users.get(user_id) if user_id else None

    log.debug("Session: %s", request.ctx.session)


async def reset_or_delete_cookie(request, response):
    # (re)set the user session cookie if there is a user
    # attached to this request context,
    # otherwise delete any set cookie (ending the session)

    if hasattr(request.ctx, "session") and request.ctx.session:
        set_cookie(response, request.ctx.session)

    elif request.cookies.get(COOKIE_NAME):
        del response.cookies[COOKIE_NAME]
        log.debug("deleted '%s' cookie", COOKIE_NAME)


# Attach a Jinja2 style "flash-message" to this session.
#  The flash messages are saved in the cookie so
#  they will be available when we fetch the cookie
#  on the next request
def flash(request, message):
    if not message:
        return
    if "msg" not in request.ctx.session:
        request.ctx.session["msg"] = []
    request.ctx.session["msg"].append(message)


def get_flashes(request):
    return request.ctx.session.pop("msg", None)


# Add flash and render_templae functions to request.ctx
async def attach_flash_handlers(request):
    request.ctx.flash = functools.partial(flash, request)

    def render_template(filename, **kwargs):
        return webserver_files.render_template(
            filename, flashes=get_flashes(request), **kwargs
        )

    request.ctx.render_template = render_template
