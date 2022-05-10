from dateutil.parser import parse
import aiohttp

from datetime import datetime
from itertools import islice, repeat, starmap, takewhile
from operator import truth
from logging import getLogger
from typing import Iterable, Iterator

log = getLogger(__name__)
log.setLevel("INFO")
log.propagate = True


def cleandict(d: dict) -> dict:
    return {k: v for k, v in d.items() if v is not None}


def href(url: str, text: str) -> str:
    return "<a href='{}' target='_blank'>{}</a>".format(url, text)


def ip_lookup_url(ip: str) -> str:
    return "http://freegeoip.net/json/{}".format(ip) if ip else "#"


async def ip_lookup(session: aiohttp.ClientSession, ip_address: str) -> dict:
    r = await session.get(ip_lookup_url(ip_address))
    return await r.json()


DatetimeObj = int | str | datetime


def to_datetime(obj: DatetimeObj) -> datetime | None:
    if not obj:
        return None
    if isinstance(obj, datetime):
        return obj
    elif isinstance(obj, int):
        return datetime.utcfromtimestamp(obj)
    try:
        dt = parse(obj, ignoretz=True)
    except ValueError:
        return None
    else:
        return dt


EPOCH = datetime.utcfromtimestamp(0)


def to_epoch(dtObj: DatetimeObj):
    dt = to_datetime(dtObj)
    if dt:
        return int((dt - EPOCH).total_seconds())


def chunks(iterable: Iterable, size=10) -> Iterator:
    """iterate over an iterable in chunks"""
    return takewhile(truth, map(tuple, starmap(islice, repeat((iter(iterable), size)))))
