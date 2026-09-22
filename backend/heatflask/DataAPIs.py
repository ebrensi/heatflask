# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
from pymongo import AsyncMongoClient
from pymongo.asynchronous.collection import AsyncCollection
import logging
import datetime
import uuid
import types
import sys
from typing import Optional
from sanic import Sanic

from .webserver.config import MONGODB_URL

log = logging.getLogger(__name__)
log.propagate = True

db = types.SimpleNamespace(mongo_client=None, mongodb=None)


# this must be called by whoever controls the asyncio loop.
# Takes only `app`: Sanic 26.6 removes the `loop` argument to listeners, and
# 25.12 already warns about it.
async def connect(app: Sanic = None):
    if db.mongodb is not None:
        return
    # tz_aware: datetimes come back from Mongo timezone-aware (UTC), so they can
    # be compared against datetime.now(timezone.utc) without a naive/aware clash
    db.mongo_client = AsyncMongoClient(MONGODB_URL, tz_aware=True)
    db.mongodb = db.mongo_client.get_default_database()
    if app:
        try:
            await db.mongodb.list_collection_names()
        except Exception:
            log.error("mongo error")
            await db.mongo_client.close()
            db.mongodb = None
            sys.exit("mongodb error")

    log.info("Connected to MongoDB")


async def disconnect(*args):
    if db.mongodb is None:
        return

    log.info("Disconnecting from MongoDB")
    await db.mongo_client.close()

    db.mongo_client = None
    db.mongodb = None


async def init_collection(
    name: str,
    ttl: Optional[int] = None,
    capped_size: Optional[int] = None,
) -> AsyncCollection:
    collections = await db.mongodb.list_collection_names()

    if name in collections:
        if ttl:
            return await update_collection_ttl(name, ttl)
        elif capped_size:
            return await update_collection_cap(name, capped_size)
        return db.mongodb.get_collection(name)

    collection: AsyncCollection = await (
        db.mongodb.create_collection(name, capped=True, size=capped_size)
        if capped_size
        else db.mongodb.create_collection(name)
    )

    if ttl:
        await collection.create_index(
            "ts", name="ts", unique=False, expireAfterSeconds=ttl
        )

    info = await collection.index_information()

    log.info("Initialized '%s' MongoDB collection: %s", name, info)
    return collection


async def update_collection_ttl(name: str, new_ttl: int):
    collection: AsyncCollection = db.mongodb.get_collection(name)

    # Update the MongoDB Activities TTL if necessary
    info = await collection.index_information()

    if "ts" not in info:
        # A collection that predates its TTL, which is how index_v0 arrives
        # here the first time. This used to raise KeyError, out of the
        # get_collection() that every query goes through.
        await collection.create_index(
            "ts", name="ts", unique=False, expireAfterSeconds=new_ttl
        )
        log.info("%s TTL index created: %s", name, datetime.timedelta(seconds=new_ttl))
        return collection

    # A plain `ts` index has no expireAfterSeconds at all; collMod below turns
    # it into a TTL index, so None has to compare unequal to the new value
    # rather than raise.
    current_ttl = info["ts"].get("expireAfterSeconds")

    if current_ttl != new_ttl:
        await db.mongodb.command(
            "collMod",
            name,
            index={
                "keyPattern": {"ts": 1},
                "expireAfterSeconds": new_ttl,
            },
        )

        log.info(
            "%s TTL updated from %s to %s",
            name,
            "none" if current_ttl is None else datetime.timedelta(seconds=current_ttl),
            datetime.timedelta(seconds=new_ttl),
        )

    return collection


async def update_collection_cap(name: str, new_size: int):
    collection: AsyncCollection = db.mongodb.get_collection(name)
    options = await collection.options()
    current_size = options["size"]

    if current_size != new_size:
        all_docs = await collection.find().to_list(length=100000)
        temp_collection_name = uuid.uuid4().hex
        await db.mongodb.drop_collection(temp_collection_name)
        temp_collection = await db.mongodb.create_collection(
            temp_collection_name,
            capped=True,
            size=new_size,
        )
        if len(all_docs):
            await temp_collection.insert_many(all_docs)
        await temp_collection.rename(name, dropTarget=True)
        log.info(
            "%s size updated from %s to %s",
            name,
            current_size,
            new_size,
        )
    return collection


def drop(name):
    log.info("dropping '%s' collection", name)
    return db.mongodb.drop_collection(name)


def list():
    return db.mongodb.list_collection_names()


def stats(name):
    return db.mongodb.command("collstats", name)
