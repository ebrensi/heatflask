import motor
from motor.motor_asyncio import (
    AsyncIOMotorClient,
    AsyncIOMotorDatabase,
    AsyncIOMotorCollection,
)

import aioredis
import logging
import datetime
import uuid
import sys
from typing import Optional
from sanic import Sanic
from asyncio import BaseEventLoop
from dataclasses import dataclass

from .webserver.config import MONGODB_URL, REDIS_URL

log = logging.getLogger(__name__)
log.propagate = True


@dataclass
class Box:
    mongo_client: Optional[AsyncIOMotorClient]
    mongodb: Optional[AsyncIOMotorDatabase]
    redis: Optional[aioredis.Redis]


db = Box(mongo_client=None, mongodb=None, redis=None)


# this must be called by whoever controls the asyncio loop
async def connect(
    app: Optional[Sanic] = None, loop: Optional[BaseEventLoop] = None, force=False
):
    if db.mongodb is not None and not force:
        return

    if db.mongo_client is None:
        db.mongo_client = motor.motor_asyncio.AsyncIOMotorClient(MONGODB_URL)

    db.mongodb = db.mongo_client.get_default_database()
    db.redis = aioredis.from_url(REDIS_URL)
    if app:
        try:
            await db.mongodb.list_collection_names()
        except Exception:
            log.error("mongo error")
            db.mongodb = None
            sys.exit("mongodb error")

    log.info("Connected to MongoDB and Redis")


async def disconnect(*args):
    if db.mongodb is not None:
        db.mongodb = None

    if db.redis is not None:
        await db.redis.close()
        db.redis = None
    log.info("Disconnected from MongoDB and Redis")


class Connection:
    async def __aenter__(self):
        await connect()

    async def __aexit__(self, exc_type, exc_value, exc_tb):
        log.debug({"exc_type": exc_type, "exc_value": exc_value, "exc_tb": exc_tb})
        await disconnect()


async def init_collection(
    name: str,
    ttl: Optional[int] = None,
    capped_size: Optional[int] = None,
    cache_prefix: Optional[str] = None,
) -> AsyncIOMotorCollection | None:
    if db.mongodb is None or db.redis is None:
        return None

    collections = await db.mongodb.list_collection_names()

    if name in collections:
        if ttl:
            return await update_collection_ttl(name, ttl)
        elif capped_size:
            return await update_collection_cap(name, capped_size)
        return db.mongodb.get_collection(name)

    # Create/Initialize Activity database
    # Delete existing one
    if name in collections:
        await db.mongodb.drop_collection(name)

    if cache_prefix:
        to_delete = await db.redis.keys(f"{cache_prefix}:*")

        async with db.redis.pipeline(transaction=True) as pipe:
            for k in to_delete:
                pipe.delete(k)
            await pipe.execute()

    collection: AsyncIOMotorCollection = await (
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


async def update_collection_ttl(
    name: str, new_ttl: int
) -> AsyncIOMotorCollection | None:
    if db.mongodb is None:
        return None

    collection: AsyncIOMotorCollection = db.mongodb.get_collection(name)

    # Update the MongoDB Activities TTL if necessary
    info = await collection.index_information()

    current_ttl = info["ts"]["expireAfterSeconds"]

    if current_ttl != new_ttl:
        await db.mongodb.command(
            "collMod",
            name,
            index={
                "keyPattern": {"ts": 1},
                "background": True,
                "expireAfterSeconds": new_ttl,
            },
        )

        log.info(
            "%s TTL updated from %s to %s",
            name,
            datetime.timedelta(seconds=current_ttl),
            datetime.timedelta(seconds=new_ttl),
        )

    return collection


async def update_collection_cap(
    name: str, new_size: int
) -> AsyncIOMotorCollection | None:
    if db.mongodb is None:
        return None
    collection: AsyncIOMotorCollection = db.mongodb.get_collection(name)
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
    mongo = db.mongodb
    assert mongo is not None
    return mongo.drop_collection(name)


def list():
    mongo = db.mongodb
    assert mongo is not None
    return mongo.list_collection_names()


def stats(name):
    mongo = db.mongodb
    assert mongo is not None
    return mongo.command("collstats", name)
