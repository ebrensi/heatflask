import os
import motor.motor_asyncio
import aioredis
import logging
import datetime
import uuid

log = logging.getLogger(__name__)
log.propagate = True

# initialize async datastores

# MongoDB
mongo_uri = os.environ["MONGODB_URI"]
mongo_client = motor.motor_asyncio.AsyncIOMotorClient(mongo_uri)
mongodb = mongo_client.get_default_database()


# Redis
redis_url = os.environ["REDIS_URL"]
redis = aioredis.from_url(redis_url)


async def init_collection(
    name, force=False, ttl=None, capped_size=None, cache_prefix=None
):
    collections = await mongodb.list_collection_names()

    if (not force) and (name in collections):
        if ttl:
            return await update_collection_ttl(name, ttl)
        elif capped_size:
            return await update_collection_cap(name, capped_size)

    # Create/Initialize Activity database
    # Delete existing one
    if name in collections:
        await mongodb.drop_collection(name)

    if cache_prefix:
        to_delete = await redis.keys(f"{cache_prefix}:*")

        async with redis.pipeline(transaction=True) as pipe:
            for k in to_delete:
                pipe.delete(k)
            await pipe.execute()

    collection = await (
        mongodb.create_collection(name, capped=True, size=capped_size)
        if capped_size
        else mongodb.create_collection(name)
    )

    if ttl:
        await collection.create_index(
            "ts", name="ts", unique=True, expireAfterSeconds=ttl
        )

    info = await collection.index_information()

    log.info("Initialized '%s' MongoDB collection: %s", name, info)
    return collection


async def update_collection_ttl(name, new_ttl):
    collection = mongodb.get_collection(name)

    # Update the MongoDB Activities TTL if necessary
    info = await collection.index_information()

    current_ttl = info["ts"]["expireAfterSeconds"]

    if current_ttl != new_ttl:
        await mongodb.command(
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
    collection = mongodb.get_collection(name)
    options = await collection.options()
    current_size = options["size"]

    if current_size != new_size:
        all_docs = await collection.find().to_list(length=100000)
        temp_collection_name = uuid.uuid4().hex
        await mongodb.drop_collection(temp_collection_name)
        temp_collection = await mongodb.create_collection(
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
