# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
from logging import getLogger
import functools
import json
import inspect
import datetime
import base64
import binascii
import hashlib
import hmac

from typing import TypedDict, Literal, Protocol, Any, cast


from ..Types import SanicRequest, SanicResponse
from .. import Users

from .config import APP_BASE_NAME, DEV, SESSION_SECRET
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
        "max_age": int,
        "secure": bool,
        "httponly": bool,
        "samesite": Literal["Lax", "Strict", "None"],
    },
    total=False,
)

COOKIE_SPEC: Cookie = {
    "max_age": 10 * 24 * 3600,  # 10 days
    "httponly": True,
    "samesite": "Lax",
    # add_cookie() defaults secure=True. Over plain http on localhost a Secure
    # cookie is never sent back, which would silently break login in dev.
    "secure": not DEV,
}
COOKIE_NAME = APP_BASE_NAME.lower()


class Session(TypedDict, total=False):
    """This is the dict where we store session info"""

    user: int
    flashes: list[str]


class RequestContext(Protocol):
    """Our customized version of the request context"""

    session: Session
    current_user: dict
    is_admin: bool

    @staticmethod
    def flash(msg: str) -> None:
        """Flash a message to the client with the response"""

    @staticmethod
    def render_template(filename: str, **kwargs: Any) -> None:
        """Send one of our string templates with values loaded"""


class SessionRequest(SanicRequest):
    ctx: RequestContext


def sign(session: Session, secret: str = SESSION_SECRET) -> str:
    """
    Serialize a session into a cookie value that cannot be altered unnoticed:
    base64url(json) "." base64url(HMAC-SHA256 of that).

    The cookie used to be the bare JSON, and the server believed whatever user
    id it named. The payload is still readable; it holds only a user id and
    flash messages, so it needs integrity, not secrecy.
    """
    payload = base64.urlsafe_b64encode(json.dumps(session).encode()).decode()
    mac = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest()
    return f"{payload}.{base64.urlsafe_b64encode(mac).decode()}"


def unsign(value: str | None, secret: str = SESSION_SECRET) -> Session:
    """The session in a cookie value, or an empty one if it is missing or forged"""
    if not value:
        return {}
    try:
        payload, mac = value.split(".")
        expected = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(base64.urlsafe_b64decode(mac), expected):
            log.warning("session cookie with a bad signature")
            return {}
        session = json.loads(base64.urlsafe_b64decode(payload))
    except (ValueError, binascii.Error):
        # includes unsigned cookies from before signing, which end that session
        return {}
    return cast(Session, session) if isinstance(session, dict) else {}


def set_cookie(response: SanicResponse, session: Session):
    # Sanic 24.3 removed the dict-style cookie API (response.cookies[name] =
    # value, .update(), del). add_cookie()/delete_cookie() replace it.
    response.add_cookie(COOKIE_NAME, sign(session), **COOKIE_SPEC)
    log.debug("set '%s' cookie %s", COOKIE_NAME, session)


def delete_cookie(request: SanicRequest, response: SanicResponse):
    if request.cookies.get(COOKIE_NAME):
        response.delete_cookie(COOKIE_NAME)
        log.debug("deleted '%s' cookie", COOKIE_NAME)


async def fetch_session_from_cookie(request: SessionRequest):
    cookie_value = request.cookies.get(COOKIE_NAME)
    if not cookie_value:
        log.debug("No session cookie")

    request.ctx.session = unsign(cookie_value)

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
        response.delete_cookie(COOKIE_NAME)
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


def render_template(request: SessionRequest, filename: str, **kwargs: Any):
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
