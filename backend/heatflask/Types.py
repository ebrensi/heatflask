from sanic.request import Request as SanicRequest
from sanic.response import BaseHTTPResponse as SanicResponse

from typing import NewType

epoch = NewType("epoch", int)
urlstr = NewType("urlstr", str)
