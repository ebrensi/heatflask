from logging import getLogger
import functools
import json
import inspect
import datetime
from types import SimpleNamespace

from typing import TypedDict, Literal, Any, cast


from ..Types import SanicRequest, SanicResponse
from .. import Users

from .config import APP_BASE_NAME
from . import files

log = getLogger(__name__)
log.setLevel("INFO")
log.propagate = True

#
# Persistent Sessions (via cookie)
#
# When a user "logs-in" we put a cookie in their browser
# that consists of their user_id.   That way the next time they
# come to our app they will still be logged in, unless they log-out.

Cookie = TypedDict(
    "Cookie",
    {
        "expires": datetime.datetime,
        "path": str,
        "comment": str,
        "domain": str,
        "max-age": int,
        "secure": bool,
        "httponly": bool,
        "samesite": Literal["Lax", "Strict", "None"],
    },
    total=False,
)

COOKIE_SPEC: Cookie = {
    "max-age": 10 * 24 * 3600,  # 10 days
    "httponly": True,
    "samesite": "Lax",
}
COOKIE_NAME = APP_BASE_NAME.lower()


class Session(TypedDict, total=False):
    """This is the dict where we store session info"""

    user: int
    flashes: list[str]


class RequestContext(SimpleNamespace):
    """Our customized version of the request context"""

    session: Session
    current_user: dict
    is_admin: bool

    @staticmethod
    def flash(msg: str) -> None:
        """Flash a message to the client with the response"""

    @staticmethod
    def render_template(filename: str, **kwargs: Any) -> str:
        """Send one of our string templates with values loaded"""


class SessionRequest(SanicRequest):
    ctx: RequestContext


def set_cookie(response: SanicResponse, session: Session):
    response.cookies[COOKIE_NAME] = json.dumps(session)
    response.cookies[COOKIE_NAME].update(COOKIE_SPEC)
    log.debug("set '%s' cookie %s", COOKIE_NAME, response.cookies[COOKIE_NAME])


def delete_cookie(request: SanicRequest, response: SanicResponse):
    if request.cookies.get(COOKIE_NAME):
        del response.cookies[COOKIE_NAME]
        log.debug("deleted '%s' cookie", COOKIE_NAME)


async def fetch_session_from_cookie(request: SessionRequest):
    cookie_value = request.cookies.get(COOKIE_NAME)
    if not cookie_value:
        log.debug("No session cookie")

    request.ctx.session = cast(
        Session, json.loads(cookie_value) if cookie_value else {}
    )

    user_id = request.ctx.session.get("user")
    request.ctx.current_user = await Users.get(user_id) if user_id else None
    request.ctx.is_admin = Users.is_admin(user_id) if user_id else False
    log.debug("fetched session: %s", request.ctx.session)


async def reset_or_delete_cookie(request: SanicRequest, response: SanicResponse):
    """
    (Re)set the user session cookie if there is a user
    attached to this request context,
    otherwise delete any set cookie (ending the session)
    """

    has_session = hasattr(request.ctx, "session")
    if (
        has_session
        and (not request.ctx.current_user)
        and request.ctx.session.get("user")
    ):
        del request.ctx.session["user"]

    if has_session and request.ctx.session:
        try:
            set_cookie(response, request.ctx.session)
        except Exception:
            log.exception("cookie: %s", request.ctx.session)
    elif request.cookies.get(COOKIE_NAME):
        del response.cookies[COOKIE_NAME]
        log.debug("deleted '%s' cookie", COOKIE_NAME)


def flash(request: SanicRequest, message: str):
    """
    Attach a Jinja2 style "flash-message" to this session.
    The flash messages are saved in the cookie so
    they will be available when we fetch the cookie
    on the next request
    """
    if not message:
        return
    if "flashes" not in request.ctx.session:
        request.ctx.session["flashes"] = []
    request.ctx.session["flashes"].append(message)


def render_template(request: SessionRequest, filename: str, **kwargs: Any) -> str:
    flashes = request.ctx.session.pop("flashes", [])
    kwargs["flashes"] = json.dumps(flashes)
    return files.render_template(filename, **kwargs)


# Add flash and render_template functions to request.ctx
async def attach_flash_handlers(request: SanicRequest):
    request.ctx.flash = functools.partial(flash, request)
    request.ctx.render_template = functools.partial(render_template, request)


def session_cookie(get=False, set=False, flashes=False):
    """
    This is the decorator we use to specify whether
    coookies are retrieved and set for a given request route
    """

    def decorator(f):
        @functools.wraps(f)
        async def decorated_function(request, *args, **kwargs):
            if get:
                # attatch session, current_user, and is_admin
                # to request.ctx if that info is in the cookie
                await fetch_session_from_cookie(request)

            if flashes:
                # attach .flash and .render_template methods to request.ctx
                await attach_flash_handlers(request)

            # perform the endpoint function
            response = f(request, *args, **kwargs)
            if inspect.isawaitable(response):
                response = await response

            if set:
                # send a directive to the client to
                # set, update, or delete the session cookie
                await reset_or_delete_cookie(request, response)

            return response

        return decorated_function

    return decorator
