from logging import getLogger
import Users
from webserver_config import APP_NAME

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
    app.register_middleware(fetch_user_from_cookie_info, "request")
    app.register_middleware(reset_or_delete_cookie, "response")


def get_cookie(request):
    cookie_value = request.cookies.get(COOKIE_NAME)
    if cookie_value:
        return cookie_value


def set_cookie(response, user_id):
    response.cookies[COOKIE_NAME] = str(user_id)
    response.cookies[COOKIE_NAME].update(DEFAULT_COOKIE_SPEC)
    log.debug("set '%s' cookie %s", COOKIE_NAME, response.cookies[COOKIE_NAME])


def delete_cookie(request, response):
    if request.cookies.get(COOKIE_NAME):
        del response.cookies[COOKIE_NAME]
        log.debug("deleted '%s' cookie", COOKIE_NAME)


async def fetch_user_from_cookie_info(request):
    info = get_cookie(request)
    user = await Users.get(info)
    request.ctx.current_user = user
    log.debug("Session user: %s", user["_id"] if user else None)


async def reset_or_delete_cookie(request, response):
    # (re)set the user session cookie if there is a user
    # attached to this request context,
    # otherwise delete any set cookie (ending the session)

    if hasattr(request.ctx, "current_user") and request.ctx.current_user:
        set_cookie(response, request.ctx.current_user["_id"])

    elif request.cookies.get(COOKIE_NAME):
        del response.cookies[COOKIE_NAME]
        log.debug("deleted '%s' cookie", COOKIE_NAME)
