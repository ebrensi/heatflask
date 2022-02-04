import os
import motor.motor_asyncio
import aioredis


# initialize async datastores

# MongoDB
mongo_uri = os.environ["MONGODB_URI"]
mongo_client = motor.motor_asyncio.AsyncIOMotorClient(mongo_uri)
mongodb = mongo_client.get_default_database()


# Redis
redis_url = os.environ["REDIS_URL"]
redis = aioredis.from_url(redis_url)
