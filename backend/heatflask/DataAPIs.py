import os
import motor.motor_asyncio
import aioredis
import logging
import datetime

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
    if {not force} and name in await mongodb.list_collection_names():
        if ttl:
            return await update_collection_ttl(name, ttl)
        elif capped_size:
            return await update_collection_cap(name, capped_size)

    else:
        # Create/Initialize Activity database
        # Delete existing one
        await mongodb.drop_collection(name)

        if cache_prefix:
            to_delete = await redis.keys(f"{cache_prefix}:*")

            async with redis.pipeline(transaction=True) as pipe:
                for k in to_delete:
                    pipe.delete(k)
                await pipe.execute()

        await mongodb.create_collection(
            name, capped=capped_size is not None, size=capped_size
        )
        collection = mongodb.get_collection(name)

        if ttl:
            await collection.create_index(
                "ts", name="ts", unique=True, expireAfterSeconds=ttl
            )

    info = await collection.index_information()
    stats = await mongodb.command("collstats", name)

    log.info("Initialized '%s' MongoDB collection: %s, %s", name, info, stats)
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
    collection = await mongodb.get_collection(name)
    all_docs = await collection.find()

    await mongodb.create_collection(
        "temp",
        capped=True,
        size=new_size,
    )
    await mongodb.temp.insert_many(all_docs)
    await mongodb.temp.rename(name, dropTarget=True)
