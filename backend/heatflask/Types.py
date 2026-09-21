# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
from sanic.request import Request as SanicRequest
from sanic.response import BaseHTTPResponse as SanicResponse

from typing import NewType

# Re-exported for annotating handlers without importing Sanic everywhere.
__all__ = ["SanicRequest", "SanicResponse", "epoch", "urlstr"]

epoch = NewType("epoch", int)
urlstr = NewType("urlstr", str)
