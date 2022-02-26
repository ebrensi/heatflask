import os
import motor.motor_asyncio
import aioredis
import logging
import datetime
import uuid
import types

log = logging.getLogger(__name__)
log.propagate = True

# initialize async datastores
use_remote = os.environ.get("USE_REMOTE_DB")

REDIS_URL = os.environ.get("REDISGREEN_URL")

# MongoDB
dev_env = os.environ["APP_ENV"].lower() == "development"
dev_mongo_url = os.environ["REMOTE_MONGODB_URL" if use_remote else "MONGODB_URL"]
prod_mongo_url = os.environ.get("ATLAS_MONGODB_URI")
mongo_url = dev_mongo_url if dev_env else prod_mongo_url


# Redis
dev_redis_url = os.environ["REMOTE_REDIS_URL" if use_remote else "REDIS_URL"]
prod_redis_url = os.environ.get("REDISGREEN_URL")
redis_url = dev_redis_url if dev_env else prod_redis_url


db = types.SimpleNamespace(mongo_client=None, mongodb=None, redis=None)


def init_app(app):
    app.register_listener(connect, "before_server_start")
    app.register_listener(disconnect, "after_server_stop")


# this must be called by whoever controls the asyncio loop
async def connect(*args):
    if db.mongodb is not None:
        return
    db.mongo_client = motor.motor_asyncio.AsyncIOMotorClient(mongo_url)
    db.mongodb = db.mongo_client.get_default_database()
    db.redis = aioredis.from_url(redis_url)
    log.info("Connected to MongoDB and Redis")


async def disconnect(*args):
    if db.mongodb is None:
        return
    db.mongo_client.close()
    await db.redis.close()
    db.mongo_client = None
    db.mongodb = None
    db.redis = None
    log.info("Disconnected from MongoDB and Redis")


async def init_collection(name, ttl=None, capped_size=None, cache_prefix=None):
    collections = await db.mongodb.list_collection_names()

    if name in collections:
        if ttl:
            return await update_collection_ttl(name, ttl)
        elif capped_size:
            return await update_collection_cap(name, capped_size)

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

    collection = await (
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


async def update_collection_ttl(name, new_ttl):
    collection = db.mongodb.get_collection(name)

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


async def update_collection_cap(name, new_size):
    collection = db.mongodb.get_collection(name)
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
    return db.mongodb.drop_collection(name)


def list():
    return db.mongodb.list_collection_names()


def stats(name):
    return db.mongodb.command("collstats", name)
