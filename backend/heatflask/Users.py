from logging import getLogger
from DataAPIs import mongodb, redis, init_collection

"""
***  For Jupyter notebook ***

Paste one of these Jupyter magic directives to the top of a cell
 and run it, to do these things:

  * %%cython --annotate
      Compile and run the cell

  * %load Users.py
     Load Users.py file into this (empty) cell

  * %%writefile Users.py
      Write the contents of this cell to Users.py

"""

log = getLogger(__name__)
log.propagate = True

APP_NAME = "heatflask"
COLLECTION_NAME = "users"
CACHE_PREFIX = "U:"

USER_TTL = 365 * 24 * 3600  # Drop a user after a year of inactivity


async def init_db():
    collection = await init_collection(
        COLLECTION_NAME, force=False, ttl=USER_TTL, cache_prefix=CACHE_PREFIX
    )
