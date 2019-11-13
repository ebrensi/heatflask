from contextlib import contextmanager
from flask import current_app as app
from flask_login import UserMixin
from sqlalchemy.dialects import postgresql as pg
from sqlalchemy import inspect
import pymongo
from datetime import datetime
import dateutil
import dateutil.parser
import stravalib
import polyline
import json
import uuid
import gevent
from gevent.pool import Pool
import requests
import cPickle
import msgpack
from bson import ObjectId
from bson.binary import Binary
from bson.json_util import dumps
from . import mongo, db_sql, redis  # Global database clients
from . import EPOCH
from urllib import urlencode  #python2
# from urllib.parse import urlencode  #python3


CONCURRENCY = app.config["CONCURRENCY"]
CACHE_USERS_TIMEOUT = app.config["CACHE_USERS_TIMEOUT"]
CACHE_ACTIVITIES_TIMEOUT = app.config["CACHE_ACTIVITIES_TIMEOUT"]
STREAMS_OUT = app.config["STREAMS_OUT"]
STREAMS_TO_CACHE = app.config["STREAMS_TO_CACHE"]
OFFLINE = app.config.get("OFFLINE")
STRAVA_CLIENT_ID = app.config["STRAVA_CLIENT_ID"]
STRAVA_CLIENT_SECRET = app.config["STRAVA_CLIENT_SECRET"]
ADMIN = app.config["ADMIN"]
DAYS_INACTIVE_CUTOFF = app.config["DAYS_INACTIVE_CUTOFF"]
STORE_INDEX_TIMEOUT = app.config["STORE_INDEX_TIMEOUT"]
STORE_ACTIVITIES_TIMEOUT = app.config["STORE_ACTIVITIES_TIMEOUT"]
MAX_HISTORY_BYTES = app.config["MAX_HISTORY_BYTES"]
MAX_IMPORT_ERRORS = app.config["MAX_IMPORT_ERRORS"]

mongodb = mongo.db
log = app.logger


@contextmanager
def session_scope():
    """Provide a transactional scope around a series of operations."""
    session = db_sql.session()
    try:
        yield session
    except:
        log.debug("could not create db_sql session")
        raise
    finally:
        session.close()


class Users(UserMixin, db_sql.Model):
    Column = db_sql.Column
    String = db_sql.String
    Integer = db_sql.Integer
    Boolean = db_sql.Boolean

    id = Column(Integer, primary_key=True, autoincrement=False)

    # These fields get refreshed every time the user logs in.
    #  They are only stored in the database to enable persistent login
    username = Column(String())
    firstname = Column(String())
    lastname = Column(String())
    profile = Column(String())
    access_token = Column(String())

    measurement_preference = Column(String())
    city = Column(String())
    state = Column(String())
    country = Column(String())
    email = Column(String())

    dt_last_active = Column(pg.TIMESTAMP)
    dt_indexed = Column(pg.TIMESTAMP)

    app_activity_count = Column(Integer, default=0)
    share_profile = Column(Boolean, default=False)

    cli = None

    def db_state(self):
        state = inspect(self)
        attrs = ["transient", "pending", "persistent", "deleted", "detached"]
        return [attr for attr in attrs if getattr(state, attr)]

    def serialize(self):
        return cPickle.dumps(self)

    def info(self):
        profile = {}
        profile.update(vars(self))
        del profile["_sa_instance_state"]
        if "activity_index" in profile:
            del profile["activity_index"]
        # log.debug("{}: {}".format(self, profile))
        return profile

    @classmethod
    def from_serialized(cls, p):
        return cPickle.loads(p)

    def client(self, refresh=True, session=db_sql.session):
        try:
            access_info = json.loads(self.access_token)
        except Exception:
            # log.debug("{} bad access_token".format(self))
            return

        if OFFLINE:
            return

        if not self.cli:
            self.cli = stravalib.Client(
                access_token=access_info.get("access_token"),
                rate_limiter=(lambda x=None: None)
            )
        
        expires_at = datetime.utcfromtimestamp(access_info["expires_at"])
        now = datetime.utcnow()
        if ((now >= expires_at) and refresh) or (refresh == "force"):
            # log.debug("{} access token expired. refreshing...".format(self))
            # The existing access_token is expired
            # Attempt to refresh the token
            # log.debug("{} expired token. refreshing...".format(self))
            try:
                new_access_info = self.cli.refresh_access_token(
                    client_id=STRAVA_CLIENT_ID,
                    client_secret=STRAVA_CLIENT_SECRET,
                    refresh_token=access_info.get("refresh_token"))

            except Exception as e:
                log.error("{} token refresh fail: {}".format(self, e))
                return
            else:
                try:
                    self.access_token = json.dumps(new_access_info)
                except Exception as e:
                    log.debug(
                        "{} bad refresh data: {}"
                        .format(self, new_access_info))
                    return

                session.commit()
                self.cache()
                self.cli = stravalib.Client(
                    access_token=new_access_info.get("access_token"),
                    rate_limiter=(lambda x=None: None)
                )
                # log.debug("{} refreshed.".format(self))

        return self.cli

    def get_id(self):
        return unicode(self.id)

    def is_admin(self):
        return self.id in ADMIN

    @staticmethod
    def strava_user_data(user=None, access_info=None, session=db_sql.session):
        # fetch user data from Strava given user object or just a token
        if OFFLINE:
            return

        if user:
            client = user.client(session=session)
            access_info_string = user.access_token

        elif access_info:
            access_token = access_info["access_token"]
            access_info_string = json.dumps(access_info)
            client = stravalib.Client(access_token=access_token)

        else:
            return
        
        try:
            strava_user = client.get_athlete()
        except Exception as e:
            log.debug(
                "error getting user data from token: {}"
                .format(e))
            return

        else:

            return {
                "id": strava_user.id,
                "username": strava_user.username,
                "firstname": strava_user.firstname,
                "lastname": strava_user.lastname,
                "profile": strava_user.profile_medium or strava_user.profile,
                "measurement_preference": strava_user.measurement_preference,
                "city": strava_user.city,
                "state": strava_user.state,
                "country": strava_user.country,
                "email": strava_user.email,
                "access_token": access_info_string
            }

    @staticmethod
    def key(identifier):
        return "U:{}".format(identifier)

    def cache(self, identifier=None, ttl=CACHE_USERS_TIMEOUT):
        key = self.__class__.key(identifier or self.id)
        try:
            del self.cli
        except Exception:
            pass

        packed = self.serialize()
        # log.debug(
        #     "caching {} with key '{}' for {} sec. size={}"
        #     .format(self, key, timeout, len(packed))
        # )
        return redis.setex(key, ttl, packed)

    def uncache(self):
        # log.debug("uncaching {}".format(self))

        # delete from cache too.  It may be under two different keys
        redis.delete(self.__class__.key(self.id))
        redis.delete(self.__class__.key(self.username))

    def update_usage(self, session=db_sql.session):
        self.dt_last_active = datetime.utcnow()
        self.app_activity_count = self.app_activity_count + 1
        session.commit()
        self.cache()
        return self

    @classmethod
    def add_or_update(cls, cache_timeout=CACHE_USERS_TIMEOUT, session=db_sql.session, **kwargs):
        if not kwargs:
            log.debug("attempted to add_or_update user with no data")
            return

        # Creates a new user or updates an existing user (with the same id)
        detached_user = cls(**kwargs)
        try:
            persistent_user = session.merge(detached_user)
            session.commit()

        except Exception as e:
            session.rollback()
            log.error(
                "error adding/updating user {}: {}".format(kwargs, e))
        else:
            if persistent_user:
                persistent_user.cache(cache_timeout)
                # log.info("updated {} with {}"
                #                 .format(persistent_user, kwargs))
            return persistent_user

    @classmethod
    def get(cls, user_identifier, session=db_sql.session, timeout=CACHE_USERS_TIMEOUT):
        key = cls.key(user_identifier)
        cached = redis.get(key)
        
        if cached:
            redis.expire(key, CACHE_USERS_TIMEOUT)
            try:
                user = cls.from_serialized(cached)
                # log.debug(
                #     "retrieved {} from cache with key {}".format(user, key))
                return session.merge(user, load=False)
            except Exception:
                # apparently this cached user object is no good so let's
                #  delete it
                redis.delete(key)

        # Get user from db by id or username
        try:
            # try casting identifier to int
            user_id = int(user_identifier)
        except ValueError:
            # if that doesn't work then assume it's a string username
            user = cls.query.filter_by(username=user_identifier).first()
        else:
            user = cls.query.get(user_id)

        if user:
            user.cache(user_identifier, timeout)

        return user if user else None

    def delete(self, deauth=True, session=db_sql.session):
        self.delete_index()
        self.uncache()
        if deauth:
            try:
                self.client().deauthorize()
            except Exception:
                pass
        try:
            session.delete(self)
            session.commit()
        except Exception as e:
            log.exception(e)

        log.debug("{} deleted".format(self))

    def verify(self, days_inactive_cutoff=None, update=True, session=db_sql.session):
        now = datetime.utcnow()

        last_active = self.dt_last_active
        if not last_active:
            log.debug("{} was never active".format(self))
            return

        days_inactive = (now - last_active).days
        cutoff = days_inactive_cutoff or DAYS_INACTIVE_CUTOFF

        if days_inactive >= cutoff:
            # log.debug("{} inactive {} days".format(self, days_inactive))
            return

        # if we got here then the user has been active recently
        #  they may have revoked our access, which we can only
        #  know if we try to get some data on their behalf
        if update and not OFFLINE:
            user_data = self.__class__.strava_user_data(user=self)

            if user_data:
                self.__class__.add_or_update(
                    cache_timeout=60,
                    session=session,
                    **user_data
                )

                log.debug("{} successfully updated".format(self))
                return "updated"

            else:
                log.debug("{} has invalid token".format(self))
                return

        return "ok"

    @classmethod
    def triage(cls, days_inactive_cutoff=None, delete=False, update=False):
        with session_scope() as session:

            def triage_user(user):
                result = user.verify(
                    days_inactive_cutoff=days_inactive_cutoff,
                    update=update,
                    session=session
                )

                if (not result) and delete:
                    user.delete(session=session)
                    return (user, "deleted")

                return (user, result)

            TRIAGE_CONCURRENCY = 5
            P = Pool(TRIAGE_CONCURRENCY)
            deleted = 0
            updated = 0
            invalid = 0
            count = 0
          
            triage_jobs = P.imap_unordered(
                triage_user, cls.query,
                maxsize=TRIAGE_CONCURRENCY + 2
            )
            for user, status in triage_jobs:
                count += 1
                if status == "deleted":
                    deleted += 1
                    invalid += 1

                elif status == "updated":
                    updated += 1

                elif not status:
                    status = "invalid"
                    invalid += 1

                yield (user.id, status)
            
            msg = (
                "Users db triage: count={}, invalid={}, updated={}, deleted={}, "
                .format(count, invalid, updated, deleted)
            )
            log.debug(msg)
            EventLogger.new_event(msg=msg)
 
    @classmethod
    def dump(cls, attrs, **filter_by):
        dump = [{attr: getattr(user, attr) for attr in attrs}
                for user in cls.query.filter_by(**filter_by)]
        return dump

    def index_count(self):
        return Index.user_index_size(self)

    def delete_index(self):
        return Index.delete_user_entries(self)

    def indexing(self, status=None):
        # Indicate to other processes that we are currently indexing
        #  This should not take any longer than 30 seconds
        key = "indexing {}".format(self.id)
        if status is None:
            return redis.get(key) == "True"
        elif status:
            return redis.setex(key, 60, str(status))
        else:
            redis.delete(key)

    def build_index(self, fetch_limit=0, **args):
        if OFFLINE:
            return

        return Index.import_user(
            self,
            out_query=args,
            fetch_query={"limit": fetch_limit}
        )

    def query_activities(self,
                         activity_ids=None,
                         exclude_ids=[],
                         limit=None,
                         after=None, before=None,
                         only_ids=False,
                         summaries=True,
                         streams=False,
                         owner_id=False,
                         build_index=True,
                         update_index_ts=True,
                         cache_timeout=CACHE_ACTIVITIES_TIMEOUT,
                         cancel_key=None,
                         **kwargs):

        if self.indexing():
            yield {
                "error": ("Building activity index for {}...<br>Please try again in a few seconds.<br>"
                            .format(self.id))   
            }
            return

        # convert date strings to datetimes, if applicable
        if before or after:
            try:
                if after:
                    after = Utility.to_datetime(after)
                if before:
                    before = Utility.to_datetime(before)
                if before and after:
                    assert(before > after)
            except AssertionError:
                yield {"error": "Invalid Dates"}
                return

        if (summaries or limit or only_ids or after or before):

            if self.index_count():

                gen, to_delete = Index.query(
                    user=self,
                    activity_ids=activity_ids,
                    limit=limit + 10 if limit else 0,
                    after=after, before=before,
                    exclude_ids=exclude_ids,
                    ids_only=only_ids,
                    update_ts=update_index_ts
                )

                if cancel_key and not redis.exists(cancel_key):
                    log.debug("activities query for %s cancelled", self)
                    return

                if only_ids:
                    for id in gen:
                        yield id
                    return

                if to_delete:
                    yield {"delete": to_delete}

            elif build_index:
                # There is no activity index and we are to build one
                if only_ids:
                    yield {"error": "{} has no index".format(self)}
                    return

                else:
                    if OFFLINE:
                        yield {"error": "No Network Connection"}
                        return

                    gen = self.build_index(
                        limit=limit + 10 if limit else 0,
                        after=after,
                        before=before,
                        activitiy_ids=activity_ids,
                        cancel_key=cancel_key
                    )
            else:
                # Finally, if there is no index and rather than building one
                # we are requested to get the summary data directily from Strava
                log.error(
                    "{}: attempt to get summaries from Strava without build"
                    .format(self))

                yield{"error": "Sorry. not gonna do it."}
                return

        DB_TTL = STORE_INDEX_TIMEOUT
        NOW = datetime.utcnow()

        # At this point we have a generator called gen
        #  that yields Activity summaries, without streams
        #  we will attempt to get the stream associated with 
        #  each summary and yield it.

        # log.debug("NOW: {}, DB_TTL: {}".format(NOW, DB_TTL))
        to_fetch = {}
        num_fetched = 0

        for A in gen:
            # log.debug(A)
            if "_id" not in A:
                # This is not an activity. It is
                #  an error message or something
                yield A
                continue

            elif "empty" in A:
                continue

            if summaries:
                A["ts_local"] = str(A["ts_local"])
                A["ts_UTC"] = str(A["ts_UTC"])
                if "ts" in A:
                    ts = A["ts"]
                    try:
                        delta = (NOW - ts).seconds if NOW >= ts else 0
                        A["ts"] = DB_TTL - delta
                        # log.debug("delta: {}, remain: {}".format(delta,  A["ts"]))
                    except Exception as e:
                        log.exception(e)
                        del A["ts"]
                        
            if owner_id:
                A.update({"owner": self.id, "profile": self.profile})

            # log.debug("sending activity {}...".format(A["_id"]))
            # gevent.sleep(0.5)  # test delay

            if streams:
                to_fetch[A["_id"]] = A
            else:
                yield A

            num_fetched += 1
            if limit and num_fetched >= limit:
                break
                
        if not streams:
            return

        num_empty = 0
        num_fetched = 0
        num_imported = 0
        num_errors = 0

        for id, stream_data in Activities.get_many(to_fetch.keys()):

            if cancel_key and not redis.exists(cancel_key):
                log.debug("activities query for %s cancelled", self)
                return

            if stream_data:
                if "empty" in stream_data:
                    num_empty += 1
                else:
                    A = to_fetch.pop(id)
                    A.update(stream_data)
                    yield A
                    num_fetched += 1

        if not OFFLINE:
            client = self.client()
            if not client:
                log.debug(
                    "{} cannot import. bad client.".format(self)
                )
                yield (
                    {"error": "cannot import. invalid access token. {} must re-authenticate"
                     .format(self)}
                )
                
                return

            to_import = to_fetch.values()

            if to_import:
                cancel_imports = False
                P = Pool(CONCURRENCY)

                def import_activity_stream(A):
                    if cancel_imports or (cancel_key and not redis.exists(cancel_key)):
                        # log.debug("%s import cancelled", A["_id"])
                        return

                    imported = Activities.import_streams(client, A)
                    return imported
                
                imported = P.imap_unordered(
                    import_activity_stream,
                    to_import,
                    maxsize=CONCURRENCY + 2
                )

                for A in imported:
                    if cancel_imports:
                        break

                    if A:
                        num_imported += 1
                        yield A

                    elif A is False:
                        num_errors += 1
                        if num_errors > MAX_IMPORT_ERRORS:
                            log.info(
                                "too many errors. aborting import for {}".format(self)
                            )
                            cancel_imports = True
                            P.kill()
                            break

        msg = "{} queued {} ({} fetched, {} imported, {} empty, {} errors)".format(
            self.id,
            num_fetched + num_imported,
            num_fetched,
            num_imported,
            num_empty,
            num_errors
        )

        log.info(msg)
        EventLogger.new_event(msg=msg)


    def make_payment(self, amount):
        success = Payments.add(self, amount)
        return success

    def payment_record(self, after=None, before=None):
        return Payments.get(self, after=after, before=before)


class Index(object):
    name = "index"
    db = mongodb.get_collection(name)
    DB_TTL = STORE_INDEX_TIMEOUT
    
    @classmethod
    # Initialize the database
    def init_db(cls, clear_cache=False):
        # drop the "indexes" collection
        try:
            mongodb.drop_collection(cls.name)
        except Exception as e:
            log.debug(
                "error deleting '{}' collection from MongoDB.\n{}"
                .format(cls.name, e))

        # create new index collection
        mongodb.create_collection(cls.name)

        cls.db.create_index("user_id")
        cls.db.create_index([("ts_UTC", pymongo.DESCENDING)])

        # cls.db.create_index([("start_latlng", pymongo.GEO2D)])
        result = cls.db.create_index(
            "ts",
            name="ts",
            expireAfterSeconds=cls.DB_TTL
        )


        log.info(
            "initialized '{}' collection: {}".format(
                cls.name,
                result))

    @classmethod
    def update_ttl(cls, timeout=DB_TTL):

        # Update the MongoDB Index TTL if necessary
        info = cls.db.index_information()

        current_ttl = info["ts"]["expireAfterSeconds"]

        if current_ttl != timeout:
            result = mongodb.command(
                'collMod',
                cls.name,
                index={'keyPattern': {'ts': 1},
                       'background': True,
                       'expireAfterSeconds': timeout}
            )

            log.info("`{}` db TTL updated: {}".format(cls.name, result))
        else:
            # log.debug("no need to update TTL")
            pass

    @classmethod
    def strava2doc2(cls, a):
        polyline = a["map"]["summary_polyline"]
        d = {
            "_id": a["id"],
            "user_id": a["athlete"]["id"],
            "name": a["name"],
            "type": a["type"],
            "ts_UTC": a["start_date"],
            "ts_local": a["start_date_local"],
            "ts": datetime.utcnow(),
            "total_distance": float(a["distance"]),
            "elapsed_time": int(a["elapsed_time"]),
            "average_speed": float(a["average_speed"]),
            "start_latlng": a["start_latlng"] if "start_latlng" in a else None,
            "bounds": Activities.bounds(polyline) if polyline else None
        }
        return d

    def strava2doc(cls, a):
        polyline = a.map.summary_polyline
        d = {
            "_id": a.id,
            "user_id": a.athlete.id,
            "name": a.name,
            "type": a.type,
            "ts_UTC": a.start_date,
            "ts_local": a.start_date_local,
            "ts": datetime.utcnow(),
            "total_distance": float(a.distance),
            "elapsed_time": int(a.elapsed_time.total_seconds()),
            "average_speed": float(a.average_speed),
            "start_latlng": a.start_latlng[0:2] if a.start_latlng else None,
            "bounds": Activities.bounds(polyline) if polyline else None
        }
        return d

    @classmethod
    def delete(cls, id):
        try:
            return cls.db.delete_one({"_id": id})
        except Exception as e:
            log.exception(e)
            return

    @classmethod
    def update(cls, id, updates, replace=False):
        if not updates:
            return

        if replace:
            doc = {"_id": id}
            updates.update(doc)
            cls.db.replace_one(doc, updates, upsert=True)


        # log.debug("user {} got update {}".format(id, updates))
        if "title" in updates:
            updates["name"] = updates["title"]
            del updates["title"]

        try:
            return cls.db.update_one({"_id": id}, {"$set": updates})
        except Exception as e:
            log.exception(e)

    @classmethod
    def delete_user_entries(cls, user):
        try:
            result = cls.db.delete_many({"user_id": user.id})
            log.debug("deleted index entries for {}".format(user.id))
            return result
        except Exception as e:
            log.error(
                "error deleting index entries for user {} from MongoDB:\n{}"
                .format(user, e)
            )

    @classmethod
    def user_index_size(cls, user):
        try:
            activity_count = cls.db.count({"user_id": user.id})
        except Exception as e:
            log.error(
                "Error retrieving activity count for {}: {}"
                .format(user, e))
            return

        return activity_count

    @classmethod
    def import_user(cls, user, fetch_query={"limit": 10}, out_query={}, cancel_key=None):

        if OFFLINE:
            yield {"error": "No network connection"}
            return

        for query in [fetch_query, out_query]:
            if "before" in query:
                query["before"] = Utility.to_datetime(query["before"])
            if "after" in query:
                query["after"] = Utility.to_datetime(query["after"])

        count = 0
        mongo_requests = []
        rendering = True
        user.indexing(True)
        start_time = datetime.utcnow()
        log.debug("building activity index for {}".format(user))

        activity_ids = out_query.get("activity_ids")
        after = out_query.get("after")
        before = out_query.get("before")
        limit = out_query.get("limit")

        def in_date_range(dt):
            if not (before or after):
                return

            t1 = (not after) or (after <= dt)
            t2 = (not before) or (dt <= before)
            result = (t1 and t2)
            return result

        try:
            client = StravaClient(user=user)

            if not client:
                raise Exception("Invalid access_token. {} is not authenticated.".format(user))

            summaries = client.get_activities(
                cancel_key=cancel_key,
                **fetch_query
            )

            for a in summaries:

                d = cls.strava2doc2(a)
                # log.debug("{}. {}".format(count, d))
                mongo_requests.append(
                    pymongo.ReplaceOne({"_id": d["_id"]}, d, upsert=True)
                )
                count += 1

                if count % 5:
                    # only output count every 5 items to cut down on data
                    yield {"idx": count}
                    # log.debug("put index {}".format(count))

                if not rendering:
                    continue

                if ((activity_ids and (d["_id"] in activity_ids)) or
                     (limit and (count <= limit)) or
                        in_date_range(d["ts_local"])):

                    d2 = dict(d)
                    d2["ts_local"] = str(d2["ts_local"])
                    d2["ts_UTC"] = str(d2["ts_UTC"])

                    yield d2

                    if activity_ids:
                        activity_ids.remove(d["_id"])
                        if not activity_ids:
                            rendering = False
                            yield {"stop_rendering": 1}

                if ((limit and count >= limit) or
                        (after and (d["ts_local"] < after))):
                    rendering = False
                    yield {"stop_rendering": 1}
                  
            if not mongo_requests:
                EventLogger.new_event(
                    msg="no activities for {}".format(user.id)
                )
                result = []

                yield {"error": "No activities!"}
            
            else:
                result = cls.db.bulk_write(
                    mongo_requests,
                    ordered=False
                )
        except Exception as e:
            yield {"error": str(e)}

            log.error(
                "Error while building activity index for {}".format(user))
            log.exception(e)
        else:
            elapsed = datetime.utcnow() - start_time
            msg = (
                "{}'s index built in {} sec. count={}"
                .format(user.id, round(elapsed.total_seconds(), 3), count)
            )

            log.debug(msg)
            EventLogger.new_event(msg=msg)
            yield {"msg": "done indexing {} activities.".format(count)}
        
        finally:
            user.indexing(False)

    @classmethod
    def import_by_id(cls, user, activity_ids):
        client = user.client()
        if not client:
            # log.error("{} fetch error: bad client".format(user))
            return
        
        def fetch(id):
            try:
                A = client.get_activity(id)
                a = cls.strava2doc(A)
            except Exception:
                # log.exception("%s import %s failed", user, id)
                return

            # log.debug("fetched activity {} for {}".format(id, user))
            return pymongo.ReplaceOne({"_id": A.id}, a, upsert=True)

        pool = Pool(CONCURRENCY)
        mongo_requests = list(
            req for req in pool.imap_unordered(fetch, activity_ids)
            if req
        )

        if not mongo_requests:
            return

        try:
            cls.db.bulk_write(mongo_requests)
        except Exception as e:
            log.exception(e)

    @classmethod
    def query(cls, user=None,
              activity_ids=None,
              exclude_ids=None,
              after=None, before=None,
              limit=0,
              ids_only=False,
              update_ts=True
              ):

        if activity_ids:
            activity_ids = set(int(id) for id in activity_ids)

        if exclude_ids:
            exclude_ids = set(int(id) for id in exclude_ids)

        limit = int(limit)
        query = {}
        out_fields = None

        if user:
            query["user_id"] = user.id
            out_fields = {"user_id": False}

        tsfltr = {}
        if before:
            before = Utility.to_datetime(before)
            tsfltr["$lt"] = before

        if after:
            after = Utility.to_datetime(after)
            tsfltr["$gte"] = after
        
        if tsfltr:
            query["ts_local"] = tsfltr

        if activity_ids:
            query["_id"] = {"$in": list(activity_ids)}

        to_delete = None

        if exclude_ids:
            try:
                result = cls.db.find(
                    query,
                    {"_id": True}
                ).sort(
                    "ts_UTC",
                    pymongo.DESCENDING
                ).limit(limit)

            except Exception as e:
                log.exception(e)
                return
            
            query_ids = set(
                int(doc["_id"]) for doc in result
            )

            to_delete = list(exclude_ids - query_ids)
            to_fetch = list(query_ids - exclude_ids)

            query["_id"] = {"$in": to_fetch}

            # log.debug("query ids: {}\nexclude: {}\nto_fetch: {}\ndelete: {}"
            #     .format(
            #         sorted(query_ids), 
            #         sorted(exclude_ids),
            #         sorted(to_fetch),
            #         sorted(to_delete)))

            if ids_only:
                return (to_fetch, to_delete)

        # log.debug(query)

        if ids_only:
            out_fields = {"_id": True}

        try:
            if out_fields:
                cursor = cls.db.find(query, out_fields)
            else:
                cursor = cls.db.find(query)
            cursor = cursor.sort("ts_UTC", pymongo.DESCENDING).limit(limit)

        except Exception as e:
            log.error(
                "error accessing mongodb Index collection:\n{}"
                .format(e)
            )
            return []

        def iterator(cur):
            ids = []
            yield {"count": cur.count(True)}

            for a in cur:
                a_id = a["_id"]
                if update_ts:
                    ids.append(a_id)

                if ids_only:
                    yield a_id
                else:
                    yield a

            if update_ts:
                try:
                    result = cls.db.update_many(
                        {"_id": {"$in": ids}}, 
                        {"$set": {"ts": datetime.utcnow()}}
                    )
                except Exception as e:
                    log.error(
                        "Could not update ts for {}: {}"
                        .format(user, e)
                    )

        return iterator(cursor), to_delete

class StravaClient(object):
    # Stravalib includes a lot of unnecessary overhead
    #  so we have our own in-house client

    PAGE_SIZE = 200
    PAGE_REQUEST_CONCURRENCY = 10
    MAX_PAGE = 100
    BASE_URL = "https://www.strava.com/api/v3"
    GET_ACTIVITIES_URL = "/athlete/activities"

    def __init__(self, access_token=None, user=None):
        if access_token:
            self.access_token = access_token
            self.user = None
        elif user:
            self.user = user
            self.access_token = user.client().access_token
            # self.access_token = None

    def headers(self):
        return {
            "Authorization": "Bearer {}".format(self.access_token)
        }

    def get_activities(self, before=None, after=None, limit=0, cancel_key=None):
        cls = self.__class__

        query_base_url = (
            cls.BASE_URL + cls.GET_ACTIVITIES_URL +
            "?per_page={}".format(cls.PAGE_SIZE)
        )

        #  handle parameters
        try:
            limit = int(limit)
        except Exception as e:
            log.exception(e)
            return

        if before:
            before = int((before - EPOCH).total_seconds())
            query_base_url += "&before={}".format(before)
        
        if after:
            after = int((after - EPOCH).total_seconds())
            query_base_url += "&after={}".format(after)

        def request_page(pagenum):

            if pagenum > self.final_page:
                # log.debug("{} page {} cancelled".format(self.user, pagenum))
                return pagenum, None

            url = query_base_url + "&page={}".format(pagenum)
            
            # log.debug("{} requesting page {}".format(self.user, pagenum))
            start = datetime.utcnow()

            try:
                response = requests.get(url, headers=self.headers())
                
                if response.status_code in [204]:
                    raise StopIteration

                activities = response.json()

                if "errors" in activities:
                    raise Exception(activities)

            except Exception as e:
                log.exception(e)
                self.final_page = pagenum
                activities = None

            size = len(activities)
            if size < cls.PAGE_SIZE:
                #  if this page has fewer than PAGE_SIZE entries
                #  then there cannot be any higher pages
                self.final_page = pagenum

            elapsed = (datetime.utcnow() - start).total_seconds()
                
            self.download_times[pagenum] = (size, elapsed)

            log.debug("{} index page {} in {} secs: count={}".format(
                self.user, pagenum, elapsed, size))

            return pagenum, activities

        pool = Pool(cls.PAGE_REQUEST_CONCURRENCY)
# 
        num_activities_retrieved = 0
        num_pages_processed = 0

        self.download_times = {}
        self.final_page = cls.MAX_PAGE

        def page_iterator():
            page = 1
            while page <= self.final_page:
                yield page
                page += 1

        # imap_unordered gives a little better performance if order
        #   of results doesn't matter, which is the case if we aren't
        #   limited to the first n elements.  
        mapper = pool.imap if limit else pool.imap_unordered

        # mapper = pool.imap
        jobs = mapper(
            request_page,
            page_iterator(),
            maxsize=cls.PAGE_REQUEST_CONCURRENCY + 2
        )

        try:
            while num_pages_processed <= self.final_page:
                pagenum, activities = next(jobs)

                if not activities:
                    continue

                num = len(activities)

                if limit and (num + num_activities_retrieved > limit):
                    # make sure no more requests are made
                    # log.debug("no more pages after this")
                    self.final_page = pagenum

                for a in activities:
                    if "start_latlng" in a:
                        yield a

                        num_activities_retrieved += 1
                        if limit and (num_activities_retrieved >= limit):
                            raise StopIteration

                    if cancel_key and not redis.exist(cancel_key):
                        log.debug("%s get_actvities cancelled", self.user)
                        raise StopIteration

                num_pages_processed += 1
                    
        except StopIteration:
            pass
        except Exception as e:
            log.exception(e)
        finally:
            self.final_page = pagenum
            pool.kill()

#  Activities class is only a proxy to underlying data structures.
#  There are no Activity objects
class Activities(object):
    name = "activities"
    db = mongodb.get_collection(name)

    CACHE_TTL = CACHE_ACTIVITIES_TIMEOUT
    DB_TTL = STORE_ACTIVITIES_TIMEOUT

    @classmethod
    def init_db(cls, clear_cache=False):
        # Create/Initialize Activity database
        try:
            mongodb.drop_collection(cls.name)
        except Exception as e:
            log.debug(
                "error deleting '{}' collection from MongoDB.\n{}"
                .format(cls.name, e))
            result1 = e

        if clear_cache:
            to_delete = redis.keys(cls.cache_key("*"))
            if to_delete:
                result2 = redis.delete(*to_delete)
            else:
                result2 = None

        mongodb.create_collection(cls.name)
        
        result = cls.db.create_index(
            "ts",
            name="ts",
            expireAfterSeconds=cls.DB_TTL
        )
        log.info("initialized '{}' collection".format(cls.name))
        return result
        
    
    @classmethod 
    def update_ttl(cls, timeout=DB_TTL):

        # Update the MongoDB Activities TTL if necessary 
        info = cls.db.index_information()

        current_ttl = info["ts"]["expireAfterSeconds"]


        if current_ttl != timeout:
            result = mongodb.command('collMod', cls.name,
                        index={'keyPattern': {'ts': 1},
                                'background': True,
                                'expireAfterSeconds': timeout}
                     )

            log.info("`{}` db TTL updated: {}".format(cls.name, result))
        else:
            # log.debug("no need to update TTL")
            pass

    @staticmethod
    def bounds(poly):
        if poly:
            latlngs = polyline.decode(poly)

            lats = [ll[0] for ll in latlngs]
            lngs = [ll[1] for ll in latlngs]

            return {
                "SW": (min(lats), min(lngs)),
                "NE": (max(lats), max(lngs))
            }
        else:
            return {}

    @staticmethod
    def stream_encode(vals):
        diffs = [b - a for a, b in zip(vals, vals[1:])]
        encoded = []
        pair = None
        for a, b in zip(diffs, diffs[1:]):
            if a == b:
                if pair:
                    pair[1] += 1
                else:
                    pair = [a, 2]
            else:
                if pair:
                    if pair[1] > 2:
                        encoded.append(pair)
                    else:
                        encoded.extend(2 * [pair[0]])
                    pair = None
                else:
                    encoded.append(a)
        if pair:
            encoded.append(pair)
        else:
            encoded.append(b)
        return encoded

    @staticmethod
    def stream_decode(rll_encoded, first_value=0):
        running_sum = first_value
        out_list = [first_value]

        for el in rll_encoded:
            if isinstance(el, list) and len(el) == 2:
                val, num_repeats = el
                for i in xrange(num_repeats):
                    running_sum += val
                    out_list.append(running_sum)
            else:
                running_sum += el
                out_list.append(running_sum)

        return out_list

    @staticmethod
    def cache_key(id):
        return "A:{}".format(id)

    @classmethod
    def set(cls, id, data, ttl=CACHE_TTL):
        # cache it first, in case mongo is down
        packed = msgpack.packb(data)
        result1 = redis.setex(cls.cache_key(id), ttl, packed)

        document = {
            "ts": datetime.utcnow(),
            "mpk": Binary(packed)
        }
        try:
            result2 = cls.db.update_one(
                {"_id": int(id)},
                {"$set": document},
                upsert=True)
        except Exception as e:
            result2 = None
            log.debug("error writing activity {} to MongoDB: {}"
                      .format(id, e))
        return result1, result2

    @classmethod
    def get_many(cls, ids, ttl=CACHE_TTL):

        keys = [cls.cache_key(id) for id in ids]
        
        # Attempt to fetch activities with ids from redis cache
        read_pipe = redis.pipeline()
        for key in keys:
            read_pipe.get(key)

        # output and Update TTL for cached actitivities
        notcached = {}
        results = read_pipe.execute()

        write_pipe = redis.pipeline()

        for id, key, cached in zip(ids, keys, results):
            if cached:
                write_pipe.expire(key, ttl)
                yield (id, msgpack.unpackb(cached))
            else:
                notcached[int(id)] = key
        
        # Batch update TTL for redis cached activity streams
        # write_pipe.execute()
        fetched = []
        if notcached:
            # Attempt to fetch uncached activities from MongoDB
            try:
                results = cls.db.find({"_id": {"$in": notcached.keys()}})
            except Exception as e:
                log.debug(
                        "error accessing activities from MongoDB: {}"
                        .format(e))
                return

            # iterate through results from MongoDB query
            for doc in results:
                id = int(doc["_id"])
                packed = doc["mpk"]

                # Store in redis cache
                write_pipe.setex(notcached[id], ttl, packed)
                fetched.append(id)

                yield (id, msgpack.unpackb(packed))

        # All fetched streams have been sent to the client
        # now we update the data-stores
        now = datetime.utcnow()

        # results = {}

        # We need to make sure we don't exceed the limit
        #  of how many bulk writes we can do at one time
        redis_result = write_pipe.execute()

        # if redis_result:
        #     elapsed = (datetime.utcnow() - now).total_seconds()
        #     log.debug(
        #         "{} redis batch writes took {} secs: {}, {}"
        #         .format(
        #             len(redis_result), elapsed,
        #             redis_result.count(True),
        #             redis_result.count(False)
        #         )
        #     )

        if fetched:
            # now update TTL for mongoDB records if there were any
            now = datetime.utcnow()
            try:
                mongo_result = cls.db.update_many(
                    {"_id": {"$in": fetched}},
                    {"$set": {"ts": now}}
                )
            except Exception as e:
                log.debug(
                        "failed to update activities in mongoDB: {}"
                        .format(e))

            # elapsed = (datetime.utcnow() - now).total_seconds()
            # log.debug(
            #     "{} MongoDB batch writes took {} secs"
            #     .format(mongo_result.raw_result["n"], elapsed)
            # )

    @classmethod
    def get(cls, id, ttl=CACHE_TTL):
        packed = None
        key = cls.cache_key(id)
        cached = redis.get(key)

        if cached:
            redis.expire(key, ttl)  # reset expiration timeout
            # log.debug("got Activity {} from cache".format(id))
            packed = cached
        else:
            try:
                document = cls.db.find_one_and_update(
                    {"_id": int(id)},
                    {"$set": {"ts": datetime.utcnow()}}
                )

            except Exception as e:
                log.debug(
                    "error accessing activity {} from MongoDB:\n{}"
                    .format(id, e))
                return

            if document:
                packed = document["mpk"]
                redis.setex(key, ttl, packed)
                # log.debug("got activity {} data from MongoDB".format(id))
        if packed:
            return msgpack.unpackb(packed)

    @classmethod
    def import_streams(cls, client, activity, timeout=CACHE_TTL):
        if OFFLINE:
            return

        EMPTY = {"empty": True}
        ESSENTIAL_STREAMS = ["time"]
 
        streams_to_import = list(STREAMS_TO_CACHE) + ["latlng"]
        try:
            streams_to_import.remove("polyline")
        except Exception:
            pass

        _id = activity["_id"]

        # start = datetime.utcnow()
        # log.debug("request import {}".format(_id))

        try:
            streams = client.get_activity_streams(
                _id,
                series_type='time',
                types=streams_to_import
            )

            if not streams:
                raise UserWarning("no streams")

            imported_streams = {name: streams[name].data for name in streams}

            # Encode/compress latlng data into polyline format
            try:
                latlng = imported_streams.pop("latlng")
            except KeyError:
                raise UserWarning("no stream 'latlng'")
            
            imported_streams["polyline"] = polyline.encode(latlng)

            for s in set(STREAMS_TO_CACHE) - set(["polyline"]):
                # Encode/compress these streams
                try:
                    stream = imported_streams[s]
                    assert len(stream) > 2
                except Exception:
                    if s in ESSENTIAL_STREAMS:
                        raise UserWarning("no stream '{}'".format(s))
                    else:
                        continue
        
                imported_streams[s] = cls.stream_encode(stream)
                
        except UserWarning as e:
            Index.update(_id, EMPTY, replace=True)
            log.debug("activity %s EMPTY: %s", _id, e)
            return
        except Exception:
            log.exception("error importing activity %s", _id)
            return

        cls.set(_id, imported_streams, timeout)

        for s in STREAMS_OUT:
            try:
                activity[s] = imported_streams[s]
            except Exception:
                pass
        
        # elapsed = (datetime.utcnow() - start).total_seconds()
        # log.debug("import {} took {} secs".format(_id, elapsed))

        return activity

    @classmethod
    def query(cls, queryObj):
        genID = Utility.set_genID()
        yield {"genID": genID}
        
        for user_id in queryObj:
            user = Users.get(user_id)
            if not user:
                continue

            query = queryObj[user_id]
            
            for a in user.query_activities(cancel_key=genID, **query):
                yield a
        
        yield ""
        Utility.del_genID(genID)


class EventLogger(object):
    name = "history"
    db = mongodb.get_collection(name)

    @classmethod
    def init_db(cls, rebuild=True, size=MAX_HISTORY_BYTES):

        collections = mongodb.collection_names(
            include_system_collections=False)

        if (cls.name in collections) and rebuild:
            all_docs = cls.db.find()

            mongodb.create_collection("temp",
                                      capped=True,
                                      # autoIndexId=False,
                                      size=size)

            mongodb.temp.insert_many(all_docs)

            mongodb.temp.rename(cls.name, dropTarget=True)
        else:
            mongodb.create_collection(cls.name,
                                      capped=True,
                                      size=size)
            log.info("Initialized {} collection".format(cls.name))

        stats = mongodb.command("collstats", cls.name)
        cls.new_event(msg="rebuilt event log: {}".format(stats))

    @classmethod
    def get_event(cls, event_id):
        event = cls.db.find_one({"_id": ObjectId(event_id)})
        event["_id"] = str(event["_id"])
        return event

    @classmethod
    def get_log(cls, limit=0):
        events = list(
            cls.db.find(
                sort=[("$natural", pymongo.DESCENDING)]).limit(limit)
        )
        for e in events:
            e["_id"] = str(e["_id"])
            ts = e["ts"]
            tss = (ts - EPOCH).total_seconds()
            e["ts"] = tss
        return events

    @classmethod
    def live_updates_gen(cls, ts=None):

        if not ts:
            first = cls.db.find().sort(
                '$natural',
                pymongo.DESCENDING
            ).limit(1).next()

            ts = first['ts']

        def gen(ts):
            genID = Utility.set_genID(ttl=60 * 60 * 24)
            obj = {"genID": genID}
            yield "data: {}\n\n".format(json.dumps(obj))
            yield "retry: 5000\n\n"
            while redis.exists(genID):
                # log.debug("initiate cursor at {}".format(ts))
                cursor = cls.db.find(
                    {'ts': {'$gt': ts}},
                    cursor_type=pymongo.CursorType.TAILABLE_AWAIT
                )
                elapsed = 0
                while cursor.alive & redis.exists(genID):
                    for doc in cursor:
                        elapsed = 0
                        ts = doc["ts"]
                        tss = (ts - EPOCH).total_seconds()
                        doc["ts"] = tss
                        doc["_id"] = str(doc["_id"])
                        event = dumps(doc)

                        string = (
                            "id: {}\ndata: {}\n\n"
                            .format(tss, event))
                        # log.debug(string)
                        yield string

                    # We end up here if the find() returned no
                    # documents or if the tailable cursor timed out
                    # (no new documents were added to the
                    # collection for more than 1 second)

                    gevent.sleep(1)
                    elapsed += 1
                    if elapsed > 10:
                        # log.debug("no docs in cursor")
                        elapsed = 0
                        yield ": \n\n"
            log.debug("exiting live-updates gen")

        return gen(ts)

    @classmethod
    def new_event(cls, **event):
        event["ts"] = datetime.utcnow()
        cls.db.insert_one(event)

    @classmethod
    def log_request(cls, flask_request_object, **args):
        req = flask_request_object
        args.update({
            "ip": req.access_route[-1],
            "agent": vars(req.user_agent),
        })
        cls.new_event(**args)


class Webhooks(object):
    name = "subscription"

    client = stravalib.Client()
    credentials = {
        "client_id": STRAVA_CLIENT_ID,
        "client_secret": STRAVA_CLIENT_SECRET
    }

    @classmethod
    def create(cls, callback_url):
        try:
            subs = cls.client.create_subscription(
                callback_url=callback_url,
                **cls.credentials
            )
        except Exception as e:
            return {"error": str(e)}

        if "updates" not in mongodb.collection_names():
            mongodb.create_collection("updates",
                                      capped=True,
                                      size=1 * 1024 * 1024)
        log.debug("create_subscription returns {}".format(subs))
        return {"created": str(subs)}

    @classmethod
    def handle_subscription_callback(cls, args):
        return cls.client.handle_subscription_callback(args)

    @classmethod
    def delete(cls, subscription_id=None, delete_collection=False):
        if not subscription_id:
            subs_list = cls.list()
            if subs_list:
                subscription_id = subs_list.pop()
        if subscription_id:
            try:
                cls.client.delete_subscription(subscription_id,
                                               **cls.credentials)
            except Exception as e:
                return {"error": str(e)}

            if delete_collection:
                mongodb.updates.drop()

            result = {"success": "deleted subscription {}".format(
                subscription_id)}
        else:
            result = {"error": "non-existent/incorrect subscription id"}
        log.error(result)
        return result

    @classmethod
    def list(cls):
        subs = cls.client.list_subscriptions(**cls.credentials)
        return [sub.id for sub in subs]

    @classmethod
    def handle_update_callback(cls, update_raw):

        update = cls.client.handle_subscription_update(update_raw)
        user_id = update.owner_id
        user = Users.get(user_id, timeout=10)
        if (not user) or (not user.index_count()):
            return

        record = {
            "dt": datetime.utcnow(),
            "subscription_id": update.subscription_id,
            "owner_id": update.owner_id,
            "object_id": update.object_id,
            "object_type": update.object_type,
            "aspect_type": update.aspect_type,
            "updates": update_raw.get("updates")
        }

        result = mongodb.updates.insert_one(record)

        if update.object_type == "athlete":
            return

        create = False
        if update.aspect_type == "update":
            # update the activity if it exists, or create it
            result = Index.update(update.object_id, update.updates)
            if not result:
                log.debug("{} index update failed: {}".format(user, update.updates))
                return
                # log.debug("{} index update: {}".format(user, result))

        #  If we got here then we know there are index entries for this user
        if create or (update.aspect_type == "create"):
            # fetch activity and add it to the index
            Index.import_by_id(user, [update.object_id])

        elif update.aspect_type == "delete":
            # delete the activity from the index
            result = Index.delete(update.object_id)
            # log.debug(result)

    @staticmethod
    def iter_updates(limit=0):
        updates = mongodb.updates.find(
            sort=[("$natural", pymongo.DESCENDING)]
        ).limit(limit)

        for u in updates:
            u["_id"] = str(u["_id"])
            yield u


class Payments(object):
    name = "payments"
    db = mongodb.get_collection(name)

    @classmethod
    def init_db(cls):
        try:
            mongodb.drop_collection(cls.name)
        except Exception as e:
            log.debug(
                "error deleting '{}' collection from MongoDB.\n{}"
                .format(cls.name, e))
            result1 = e

        # create new indexes collection
        mongodb.create_collection(cls.name)
        cls.db.create_index([("ts", pymongo.DESCENDING)])
        cls.db.create_index([("user", pymongo.ASCENDING)])

        log.info("initialized '{}' collection".format(cls.name))

    @staticmethod
    def get(user=None, before=None, after=None):
        query = {}

        tsfltr = {}
        if before:
            tsfltr["$gte"] = before
        if after:
            tsfltr["$lt"] = after
        if tsfltr:
            query["ts"] = tsfltr

        field_selector = {"_id": False}
        if user:
            query["user"] = user.id
            field_selector["user"] = False

        docs = list(mongodb.payments.find(query, field_selector))

        return docs

    @staticmethod
    def add(user, amount):
        mongodb.payments.insert_one({
            "user": user.id,
            "amount": amount,
            "ts": datetime.utcnow()
        })


class Utility():

    @staticmethod
    def href(url, text):
        return "<a href='{}' target='_blank'>{}</a>".format(url, text)

    @staticmethod
    def ip_lookup_url(ip):
        return "http://freegeoip.net/json/{}".format(ip) if ip else "#"

    @staticmethod
    def ip_address(flask_request_object):
        return flask_request_object.access_route[-1]

    @classmethod
    def ip_lookup(cls, ip_address):
        r = requests.get(cls.ip_lookup_url(ip_address))
        return r.json()

    @classmethod
    def ip_timezone(cls, ip_address):
        tz = cls.ip_lookup(ip_address)["time_zone"]
        return tz if tz else 'America/Los_Angeles'

    @staticmethod
    def utc_to_timezone(dt, timezone='America/Los_Angeles'):
        from_zone = dateutil.tz.gettz('UTC')
        to_zone = dateutil.tz.gettz(timezone)
        utc = dt.replace(tzinfo=from_zone)
        return utc.astimezone(to_zone)

    @staticmethod
    def to_datetime(obj):
        if not obj:
            return
        if isinstance(obj, datetime):
            return obj
        try:
            dt = dateutil.parser.parse(obj)
        except ValueError:
            return
        else:
            return dt

    @staticmethod
    def set_genID(ttl=600):
        genID = "G:{}".format(uuid.uuid4().get_hex())
        redis.setex(genID, ttl, 1)
        return genID

    @staticmethod
    def del_genID(genID):
        content = redis.get(genID)
        if content:
            redis.delete(genID)
            

