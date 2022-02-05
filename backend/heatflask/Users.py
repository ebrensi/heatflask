from logging import getLogger
from DataAPIs import mongodb, redis

"""
***  For Jupyter notebook ***

Paste one of these Jupyter magic directives to the top of a cell
 and run it, to do these things:

  * %%cython --annotate
      Compile and run the cell

  * %load ../heatflask/Users.py
     Load Users.py file into this (empty) cell

  * %%writefile ../heatflask/Users.py
      Write the contents of this cell to Users.py

"""

log = getLogger(__name__)
log.propagate = True

APP_NAME = "heatflask"
COLLECTION_NAME = "users"

USER_TTL = 365 * 24 * 3600  # Drop a user after a year of inactivity


def cache_key(user_id):
    return f"U:{user_id}"


async def init_db(clobber=False, clear_cache=True, timeout=USER_TTL):

    result = {}

    if (not clobber) and (COLLECTION_NAME in await mongodb.list_collection_names()):
        log.info("%s collection exists", COLLECTION_NAME)
        update_ttl_result = await update_ttl()
        if update_ttl_result:
            result["update_ttl"] = update_ttl_result
        return result

    # Create/Initialize Activity database
    try:
        result["drop_collection"] = await mongodb.drop_collection(COLLECTION_NAME)
    except Exception as e:
        log.exception("error deleting '%s' collection from MongoDB", COLLECTION_NAME)
        result["mongod_drop"] = str(e)

    if clear_cache:
        to_delete = await redis.keys(cache_key("*"))

        async with redis.pipeline(transaction=True) as pipe:
            for k in to_delete:
                pipe.delete(k)

            result["redis_delete_keys"] = await pipe.execute()

    result["create_collection"] = await mongodb.create_collection(COLLECTION_NAME)

    collection = mongodb.get_collection(COLLECTION_NAME)
    result["create_index"] = await collection.create_index(
        "ts", name="ts", unique=True, expireAfterSeconds=timeout
    )
    log.info(f"Initialized '{COLLECTION_NAME}' MongoDB collection")
    return result


async def update_ttl(timeout=USER_TTL):
    collection = mongodb.get_collection(COLLECTION_NAME)

    # Update the MongoDB Activities TTL if necessary
    info = await collection.index_information()

    current_ttl = info["ts"]["expireAfterSeconds"]

    if current_ttl == timeout:
        return

    result = await mongodb.command(
        "collMod",
        COLLECTION_NAME,
        index={
            "keyPattern": {"ts": 1},
            "background": True,
            "expireAfterSeconds": timeout,
        },
    )

    log.info(
        "%s TTL updated from %d to %d",
        COLLECTION_NAME,
        current_ttl,
        timeout
    )

    return result

