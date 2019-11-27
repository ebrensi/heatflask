from contextlib import contextmanager
from flask import current_app as app
from flask_login import UserMixin
from sqlalchemy.dialects import postgresql as pg
from sqlalchemy import inspect
import pymongo
from datetime import datetime, timedelta
import dateutil
import dateutil.parser
import stravalib
import polyline
import json
import uuid
import gevent
from gevent.pool import Pool
import requests
import msgpack
from bson import ObjectId
from bson.binary import Binary
from bson.json_util import dumps
import itertools
import time
from . import mongo, db_sql, redis  # Global database clients
from . import EPOCH

mongodb = mongo.db
log = app.logger
OFFLINE = app.config["OFFLINE"]
CACHE_ACTIVITIES_TIMEOUT = app.config["CACHE_ACTIVITIES_TIMEOUT"]
STRAVA_CLIENT_ID = app.config["STRAVA_CLIENT_ID"]
STRAVA_CLIENT_SECRET = app.config["STRAVA_CLIENT_SECRET"]
STORE_INDEX_TIMEOUT = app.config["STORE_INDEX_TIMEOUT"]
TRIAGE_CONCURRENCY = app.config["TRIAGE_CONCURRENCY"]
ADMIN = app.config["ADMIN"]
BATCH_CHUNK_CONCURRENCY = app.config["CHUNK_CONCURRENCY"]
BATCH_CHUNK_SIZE = app.config["BATCH_CHUNK_SIZE"]
IMPORT_CONCURRENCY = app.config["IMPORT_CONCURRENCY"]
STORE_ACTIVITIES_TIMEOUT = app.config["STORE_ACTIVITIES_TIMEOUT"]
CACHE_TTL = app.config["CACHE_ACTIVITIES_TIMEOUT"]
STREAMS_TO_CACHE = app.config["STREAMS_TO_CACHE"]
STREAMS_OUT = app.config["STREAMS_OUT"]
ESSENTIAL_STREAMS = app.config["ESSENTIAL_STREAMS"]
DAYS_INACTIVE_CUTOFF = app.config["DAYS_INACTIVE_CUTOFF"]

@contextmanager
def session_scope():
    """Provide a transactional scope around a series of operations."""
    session = db_sql.session()
    try:
        yield session
    except Exception:
        log.exception("error creating Postgres session")
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

    def __repr__(self):
        return "U:{}".format(self.id)

    def db_state(self):
        state = inspect(self)
        attrs = ["transient", "pending", "persistent", "deleted", "detached"]
        return [attr for attr in attrs if getattr(state, attr)]

    def info(self):
        profile = {}
        profile.update(vars(self))
        del profile["_sa_instance_state"]
        if "activity_index" in profile:
            del profile["activity_index"]
        return profile

    def client(self, refresh=True, session=db_sql.session):
        try:
            access_info = json.loads(self.access_token)
        except Exception:
            log.info("%s using bad access_token", self)
            return

        if OFFLINE:
            return

        t1 = time.time()
        if not self.cli:
            self.cli = stravalib.Client(
                access_token=access_info.get("access_token"),
                rate_limiter=(lambda x=None: None)
            )
        
        token_expired = access_info["expires_at"] - time.time() < 60 * 30
        
        if (token_expired and refresh) or (refresh == "force"):
            # The existing access_token is expired
            # Attempt to refresh the token
            try:
                new_access_info = self.cli.refresh_access_token(
                    client_id=STRAVA_CLIENT_ID,
                    client_secret=STRAVA_CLIENT_SECRET,
                    refresh_token=access_info.get("refresh_token"))
                
                self.access_token = json.dumps(new_access_info)

                session.commit()
            
                self.cli = stravalib.Client(
                    access_token=new_access_info.get("access_token"),
                    rate_limiter=(lambda x=None: None)
                )
            except Exception:
                log.exception("%s token refresh fail", self)
                return

        elapsed = round(time.time() - t1, 1)
        log.info("%s token refresh elapsed=%s", self, elapsed)
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
        except Exception:
            log.exception("error getting user '%s' data from token", user)
            return

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

    def is_public(self, setting=None):
        if setting is None:
            return self.share_profile

        if setting != self.share_profile:
            self.share_profile = setting
            try:
                db_sql.session.commit()
            except Exception:
                log.exception("error updating user %s", self)
        return self.share_profile

    def update_usage(self, session=db_sql.session):
        self.dt_last_active = datetime.utcnow()
        self.app_activity_count = self.app_activity_count + 1
        session.commit()
        return self

    @classmethod
    def add_or_update(cls, session=db_sql.session, **kwargs):
        if not kwargs:
            log.info("attempted to add_or_update user with no data")
            return

        # Creates a new user or updates an existing user (with the same id)
        detached_user = cls(**kwargs)
        try:
            persistent_user = session.merge(detached_user)
            session.commit()

        except Exception:
            session.rollback()
            log.exception("error adding/updating user: %s", kwargs)
        else:
            return persistent_user

    @classmethod
    def get(cls, user_identifier, session=db_sql.session):

        # Get user from db by id or username
        try:
            # try casting identifier to int
            user_id = int(user_identifier)
        except ValueError:
            # if that doesn't work then assume it's a string username
            user = cls.query.filter_by(username=user_identifier).first()
        else:
            user = cls.query.get(user_id)
        return user if user else None

    def delete(self, deauth=True, session=db_sql.session):
        self.delete_index()
        if deauth:
            try:
                self.client().deauthorize()
            except Exception:
                pass
        try:
            session.delete(self)
            session.commit()
        except Exception:
            log.exception("error deleting %s from Postgres", self)

        log.debug("%s deleted", self)

    def verify(
        self,
        days_inactive_cutoff=DAYS_INACTIVE_CUTOFF,
        update=True,
        session=db_sql.session
    ):
        cls = self.__class__
        now = datetime.utcnow()
        
        cls = self.__class__
        
        last_active = self.dt_last_active
        if not last_active:
            log.info("%s was never active", self)
            return

        days_inactive = (now - last_active).days

        if days_inactive >= days_inactive_cutoff:
            log.info("%s inactive %s days", self, days_inactive)
            return

        # if we got here then the user has been active recently
        #  they may have revoked our access, which we can only
        #  know if we try to get some data on their behalf
        if update and not OFFLINE:
            user_data = cls.strava_user_data(user=self)

            if user_data:
                self.__class__.add_or_update(
                    session=session,
                    **user_data
                )

                log.debug("%s successfully updated", self)
                return "updated"

            else:
                log.debug("%s has invalid token", self)
                return

        return True

    @classmethod
    def triage(cls, days_inactive_cutoff=None, delete=False, update=False):
        with session_scope() as session:

            def triage_user(user):
                result = user.verify(
                    days_inactive_cutoff=days_inactive_cutoff,
                    update=update,
                    session=session
                )

                if result:
                    return (user, result)

                if delete:
                    user.delete(session=session)
                    return (user, "deleted")
            
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
            
            results = dict(
                count=count,
                invalid=invalid,
                updated=updated,
                deleted=deleted
            )
            msg = "Users db triage: {}".format(results)
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
        # return or set the current state of index building
        #  for this user
        key = "IDX:{}".format(self.id)
        if status is None:
            return redis.get(key)
        
        elif status is False:
            return redis.delete(key)
        else:
            return redis.setex(key, 60, status)

    def build_index(self, **args):
        if OFFLINE:
            return

        return Index.import_user_index(
            self,
            out_query=args,
            yielding=False
        )

    def query_activities(self,
                         activity_ids=None,
                         exclude_ids=[],
                         limit=None,
                         after=None, before=None,
                         streams=False,
                         owner_id=False,
                         update_index_ts=True,
                         cache_timeout=CACHE_ACTIVITIES_TIMEOUT,
                         cancel_key=None,
                         **kwargs):

        while self.indexing():
            yield dict(idx=self.indexing())
            gevent.sleep(0.5)

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

        client_query = dict(
            limit=limit,
            after=after,
            before=before,
            activity_ids=activity_ids
        )

        if self.index_count():

            summaries_generator = Index.query(
                user=self,
                exclude_ids=exclude_ids,
                update_ts=update_index_ts,
                **client_query
            )

        else:
            # There is no activity index and we are to build one
            if OFFLINE:
                yield dict(error="OFFLINE MODE")
                return

            summaries_generator = Index.import_user_index(
                self,
                out_query=client_query,
                cancel_key=cancel_key
            )

            if not summaries_generator:
                log.info("Could not build index for %s", self)
                return

        # At this point we have a generator called summaries_generator
        #  that yields Activity summaries, without streams.

        # Here we introduce a mapper that readys an activity summary
        #  (with or without streams) to be yielded to the client
        now = datetime.utcnow()

        def export(A):
            if not A:
                return A

            # get an actvity object ready to send to client
            if "_id" not in A:
                # This is not an activity. It is
                #  an error message or something
                #  so pass it on.
                return A

            A["ts_local"] = str(A["ts_local"])
            ttl = (A["ts"] - now).total_seconds() + STORE_INDEX_TIMEOUT
            A["ttl"] = max(0, int(ttl))
            del A["ts"]

            if owner_id:
                A.update(dict(owner=self.id, profile=self.profile))

            return A
        
        # if we are only sending summaries to client,
        #  get them ready to export and yield them
        count = 0
        if not streams:
            for A in itertools.imap(export, summaries_generator):
                yield A
                count += 1
            elapsed = round(time.time() - Utility.to_epoch(now), 1)
            log.debug(
                "%s exported %s summaries in %s",
                self,
                count,
                elapsed
            )
            return

        #  summaries_generator yields activity summaries without streams
        #  We want to attach a stream to each one, get it ready to export,
        #  and yield it.

        # This generator takes a number of summaries ans attempts to
        #  append streams to each one
        # -----------------------------------------------------------
        def append_streams(summaries):
            to_import = []
            num_fetched = 0
            
            for A in Activities.append_streams_from_db(summaries):
                if not A:
                    continue
                
                if "time" in A:
                    yield A
                    num_fetched += 1
                
                elif "_id" not in A:
                    yield A
                
                else:
                    to_import.append(A)

            self.fetch_result["fetched"] += num_fetched

            if OFFLINE or (not to_import):
                return

            num_imported = 0
            for A in Activities.append_streams_from_import(
                to_import,
                self.client(),
                pool=self.import_pool
            ):

                if A:
                    yield A
                    num_imported += 1
                elif A is False:
                    self.fetch_result["errors"] += 1
                else:
                    self.fetch_result["empty"] += 1

            self.fetch_result["imported"] += num_imported
        #-------------------------------------------------------  

        if not OFFLINE:
            if not self.client():
                log.debug("%s cannot import. bad client.", self)
                yield (dict(
                    error="cannot import. invalid access token." +
                    " {} must re-authenticate".format(self)
                ))
                
                return

        chunk_pool = Pool(app.config["CHUNK_CONCURRENCY"])
        self.import_pool = Pool(app.config["IMPORT_CONCURRENCY"])
        chunks = Utility.chunks(summaries_generator, size=BATCH_CHUNK_SIZE)
        
        self.fetch_result = dict(
            empty=0,
            fetched=0,
            imported=0,
            errors=0
        )

        start_time = time.time()
          
        activities_with_streams = itertools.chain.from_iterable(
            chunk_pool.imap_unordered(
                append_streams,
                chunks,
                maxsize=BATCH_CHUNK_CONCURRENCY
            )
        )

        for A in itertools.imap(export, activities_with_streams):
            yield A

        self.fetch_result["elapsed"] = round(time.time() - start_time, 3)
        msg = "{} {}".format(self, self.fetch_result)

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
    
    @classmethod
    # Initialize the database
    def init_db(cls, clear_cache=False):
        # drop the "indexes" collection
        try:
            mongodb.drop_collection(cls.name)
        
            # create new index collection
            mongodb.create_collection(cls.name)
            cls.db.create_index([
                ("user_id", pymongo.ASCENDING),
                ("ts_local", pymongo.DESCENDING)
            ])

            cls.db.create_index(
                "ts",
                name="ts",
                expireAfterSeconds=STORE_INDEX_TIMEOUT
            )
        except Exception:
            log.exception(
                "MongoDB error initializing %s collection",
                cls.name
            )

        log.info("initialized '%s' collection:", cls.name)

    @classmethod
    def update_ttl(cls, timeout=STORE_INDEX_TIMEOUT):

        # Update the MongoDB Index TTL if necessary
        info = cls.db.index_information()

        if "ts" not in info:
            cls.init_db
            return

        current_ttl = info["ts"]["expireAfterSeconds"]

        if current_ttl != timeout:
            result = mongodb.command(
                'collMod',
                cls.name,
                index={'keyPattern': {'ts': 1},
                       'background': True,
                       'expireAfterSeconds': timeout}
            )

            log.info("'%s' db TTL updated: %s", cls.name, result)
        else:
            # log.debug("no need to update TTL")
            pass

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
        except Exception:
            log.exception("error deleting index summary %s", id)
            return

    @classmethod
    def update(cls, id, updates, replace=False):
        if not updates:
            return

        if replace:
            doc = {"_id": id}
            updates.update(doc)
            try:
                cls.db.replace_one(doc, updates, upsert=True)
            except Exception:
                log.exception("mongodb error")
                return

        if "title" in updates:
            updates["name"] = updates["title"]
            del updates["title"]

        try:
            return cls.db.update_one({"_id": id}, {"$set": updates})
        except Exception:
            log.exception("mongodb error")

    @classmethod
    def delete_user_entries(cls, user):
        try:
            result = cls.db.delete_many({"user_id": user.id})
            log.debug("deleted index entries for %s", user)
            return result
        except Exception:
            log.exception(
                "error deleting index entries for %s from MongoDB",
                user
            )

    @classmethod
    def user_index_size(cls, user):
        try:
            activity_count = cls.db.count({"user_id": user.id})
        except Exception:
            log.exception(
                "Error retrieving activity count for %s",
                user
            )
            return
        else:
            return activity_count

    @classmethod
    def _import(
        cls,
        client,
        queue=None,
        fetch_query={},
        out_query={},
        cancel_key=None
    ):
        # this method runs in a greenlet and does not have access to the
        #   current_app object.  anything that requires app context will
        #   raise a RuntimeError

        if cls.OFFLINE:
            if queue:
                queue.put(dict(error="No network connection"))
            return
        user = client.user
        
        for query in [fetch_query, out_query]:
            if "before" in query:
                query["before"] = Utility.to_datetime(query["before"])
            if "after" in query:
                query["after"] = Utility.to_datetime(query["after"])

        activity_ids = out_query.get("activity_ids")
        if activity_ids:
            activity_ids = set(int(_id) for _id in activity_ids)

        after = out_query.get("after")
        before = out_query.get("before")
        check_dates = (before or after)

        limit = out_query.get("limit")

        #  If we are getting the most recent n activities (limit) then
        #  we will need them to be in order.
        # otherwise, unordered fetching is faster
        if limit or check_dates:
            fetch_query["ordered"] = True
        
        count = 0
        in_range = False
        mongo_requests = set()
        user = client.user
        user.indexing(0)

        start_time = time.time()
        log.debug("%s building index", user)

        def in_date_range(dt):
            # log.debug(dict(dt=dt, after=after, before=before))
            t1 = (not after) or (after <= dt)
            t2 = (not before) or (dt <= before)
            result = (t1 and t2)
            return result

        def output(obj):
            if queue:
                queue.put(obj, timeout=10)

        try:
            
            summaries = client.get_activities(
                **fetch_query
            )

            dtnow = datetime.utcnow()
            for d in summaries:
                if cancel_key and not redis.exists(cancel_key):
                    #  we will try to continue building index even if
                    #  the client is no longer there
                    cancel_key = None
                    output(StopIteration)
                    queue = None
                    
                if not d or "_id" not in d:
                    continue
                
                d["ts"] = dtnow
                ts_local = None

                count += 1
                if not (count % 5):
                    user.indexing(count)
                    output(dict(idx=count))

                if queue:
                    d2 = d.copy()

                    # cases for outputting this activity summary
                    try:
                        if activity_ids:
                            if d2["_id"] in activity_ids:
                                output(d2)
                                activity_ids.discard(d2["_id"])
                                if not activity_ids:
                                    raise StopIteration
                        
                        elif limit:
                            if count <= limit:
                                output(d2)
                            else:
                                raise StopIteration

                        elif check_dates:
                            ts_local = Utility.to_datetime(d2["ts_local"])
                            if in_date_range(ts_local):
                                output(d2)

                                if not in_range:
                                    in_range = True

                            elif in_range:
                                # the current activity's date was in range
                                # but is no longer. (and are in order)
                                # so we can safely say there will not be any more
                                # activities in range
                                raise StopIteration

                        else:
                            output(d2)

                    except StopIteration:
                        output(StopIteration)
                        #  this iterator is done, as far as the consumer is concerned
                        log.debug("%s index build done yielding", user)
                        queue = None

                # put d in storage
                if ts_local:
                    d["ts_local"] = ts_local
                else:
                    d["ts_local"] = Utility.to_datetime(d["ts_local"])

                mongo_requests.add(
                    pymongo.ReplaceOne({"_id": d["_id"]}, d, upsert=True)
                )
                  
            if mongo_requests:
                cls.db.bulk_write(
                    list(mongo_requests),
                    ordered=False
                )
        except Exception as e:
            log.exception("%s index import error", user)
            output(dict(error=str(e)))
            
        else:
            elapsed = round(time.time() - start_time, 1)
            msg = (
                "{}: index import done. {}"
                .format(user.id, dict(elapsed=elapsed, count=count))
            )

            log.debug(msg)
            EventLogger.new_event(msg=msg)
            output(dict(
                msg="done indexing {} activities.".format(count)
            ))
        finally:
            output(StopIteration)
            user.indexing(False)

    @classmethod
    def import_user_index(
        cls,
        user,
        fetch_query={},
        out_query={},
        blocking=True,
        cancel_key=None
    ):

        client = StravaClient(user=user)

        if not client:
            return []
        
        args = dict(fetch_query=fetch_query, out_query=out_query)

        if out_query:
            # The presence of out_query means the caller wants
            #  us to output activities while building the index
            queue = gevent.queue.Queue()
            args.update(dict(
                queue=queue,
                cancel_key=cancel_key
            ))
            gevent.spawn(cls._import, client, **args)
            return queue

        if blocking:
            cls._import(client, **args)
        else:
            gevent.spawn(cls._import, client, **args)
        
    @classmethod
    def import_by_id(cls, user, activity_ids):
        client = user.client()
        if not client:
            log.error("{} fetch error: bad client".format(user))
            return
        
        def fetch(id):
            try:
                A = client.get_activity(id)
                a = cls.strava2doc(A)
            except Exception:
                log.error("%s import %s failed", user, id)
                return

            log.debug("%s fetched activity %s", user, id)
            return pymongo.ReplaceOne({"_id": A.id}, a, upsert=True)

        pool = Pool(cls.IMPORT_CONCURRENCY)
        mongo_requests = list(
            req for req in pool.imap_unordered(fetch, activity_ids)
            if req
        )

        if not mongo_requests:
            return

        try:
            cls.db.bulk_write(mongo_requests)
        except Exception:
            log.exception("mongo error")

    @classmethod
    def query(cls, user=None,
              activity_ids=None,
              exclude_ids=None,
              after=None, before=None,
              limit=0,
              update_ts=True
              ):

        if activity_ids:
            activity_ids = set(int(id) for id in activity_ids)

        if exclude_ids:
            exclude_ids = set(int(id) for id in exclude_ids)

        limit = int(limit) if limit else 0

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
                    "ts_local",
                    pymongo.DESCENDING
                ).limit(limit)

            except Exception:
                log.exception("mongo error")
                return
            
            query_ids = set(
                int(doc["_id"]) for doc in result
            )

            to_delete = list(exclude_ids - query_ids)
            to_fetch = list(query_ids - exclude_ids)

            yield dict(delete=to_delete, count=len(to_fetch))

            query["_id"] = {"$in": to_fetch}

        else:
            count = cls.db.count_documents(query)
            if limit:
                count = min(limit, count)

            yield dict(count=count)
        
        try:
            if out_fields:
                cursor = cls.db.find(query, out_fields)
            else:
                cursor = cls.db.find(query)

            cursor = cursor.sort("ts_UTC", pymongo.DESCENDING).limit(limit)

        except Exception:
            log.exception("mongo error")
            return

        ids = set()

        for a in cursor:
            if update_ts:
                ids.add(a["_id"])
            yield a

        if update_ts:
            try:
                result = cls.db.update_many(
                    {"_id": {"$in": list(ids)}},
                    {"$set": {"ts": datetime.utcnow()}}
                )
            except Exception:
                log.exception("mongo error")
                

class StravaClient(object):
    # Stravalib includes a lot of unnecessary overhead
    #  so we have our own in-house client
    PAGE_REQUEST_CONCURRENCY = app.config["PAGE_REQUEST_CONCURRENCY"]
    PAGE_SIZE = 200
    MAX_PAGE = 100
    # MAX_PAGE = 3  # for testing

    BASE_URL = "https://www.strava.com/api/v3"
    GET_ACTIVITIES_URL = "/athlete/activities"
    GET_STREAMS_URL = "/activities/{id}/streams?keys={keys}&key_by_type={type}"

    def __init__(self, access_token=None, user=None):
        self.user = None

        if access_token:
            self.access_token = access_token
        elif user:
            self.user = user
            self.access_token = user.client().access_token

    @classmethod
    def strava2doc(cls, a):
        if ("id" not in a) or not a["start_latlng"]:
            return
        
        bounds = Activities.bounds(a["map"]["summary_polyline"])
        if not bounds:
            return

        try:
            d = dict(
                _id=a["id"],
                user_id=a["athlete"]["id"],
                name=a["name"],
                type=a["type"],
                # group=a["athlete_count"],
                ts_UTC=a["start_date"],
                ts_local=a["start_date_local"],
                total_distance=float(a["distance"]),
                elapsed_time=int(a["elapsed_time"]),
                average_speed=float(a["average_speed"]),
                start_latlng=a["start_latlng"],
                bounds=bounds
            )
        except Exception:
            log.exception("strava2doc error")
            return
        return d

    def headers(self):
        return {
            "Authorization": "Bearer {}".format(self.access_token)
        }


    def get_activities(self, cancel_key=None, ordered=False, **query):
        cls = self.__class__

        query_base_url = "{}{}?per_page={}".format(
            cls.BASE_URL,
            cls.GET_ACTIVITIES_URL,
            cls.PAGE_SIZE
        )
        
        #  handle parameters
        try:
            if "limit" in query:
                limit = int(query["limit"])
            else:
                limit = None

            if "before" in query:
                before = Utility.to_epoch(query["before"])
                query_base_url += "&before={}".format(before)
        
            if "after" in query:
                after = Utility.to_epoch(query["after"])
                query_base_url += "&after={}".format(after)

        except Exception:
            log.exception("parameter error")
            return

        def page_iterator():
            page = 1
            while page <= self.final_index_page:
                yield page
                page += 1

        def request_page(pagenum):

            if pagenum > self.final_index_page:
                log.debug("%s page %s cancelled", self.user, pagenum)
                return pagenum, None

            url = query_base_url + "&page={}".format(pagenum)
            
            log.debug("%s request page %s", self.user, pagenum)
            start = time.time()

            try:
                response = requests.get(url, headers=self.headers())
                activities = response.json()

            except Exception as e:
                log.exception(e)
                activities = []

            size = len(activities)
            if size < cls.PAGE_SIZE:
                #  if this page has fewer than PAGE_SIZE entries
                #  then there cannot be any further pages
                self.final_index_page = min(self.final_index_page, pagenum)

            elapsed = round(time.time() - start, 2)
            log.debug(
                "%s response page %s %s",
                self.user,
                pagenum,
                dict(elapsed=elapsed, count=size
            ))

            return pagenum, activities

        pool = Pool(cls.PAGE_REQUEST_CONCURRENCY)

        num_activities_retrieved = 0
        num_pages_processed = 0

        self.final_index_page = cls.MAX_PAGE

        # imap_unordered gives a little better performance if order
        #   of results doesn't matter, which is the case if we aren't
        #   limited to the first n elements.  
        mapper = pool.imap if (limit or ordered) else pool.imap_unordered

        jobs = mapper(
            request_page,
            page_iterator(),
            maxsize=cls.PAGE_REQUEST_CONCURRENCY + 2
        )

        try:
            while num_pages_processed <= self.final_index_page:
                pagenum, activities = next(jobs)

                if not activities:
                    continue

                if "errors" in activities:
                    raise UserWarning("Strava error")
                   
                num = len(activities)
                if num < cls.PAGE_SIZE:
                    total_num_activities = (pagenum - 1) * cls.PAGE_SIZE + num
                    yield dict(count=total_num_activities)

                if limit and (num + num_activities_retrieved > limit):
                    # make sure no more requests are made
                    # log.debug("no more pages after this")
                    self.final_index_page = pagenum

                for a in activities:
                    if cancel_key and not redis.exists(cancel_key):
                        log.debug("%s get_actvities cancelled", self.user)
                        break

                    doc = cls.strava2doc(a)
                    if not doc:
                        continue
                    
                    yield doc

                    num_activities_retrieved += 1
                    if limit and (num_activities_retrieved >= limit):
                        break

                num_pages_processed += 1

        except StopIteration:
            pass
        except UserWarning:
            # TODO: find a more graceful way to do this
            log.exception("%s", activities)
            self.user.delete()
        except Exception as e:
            log.exception(e)
        finally:
            self.final_index_page = min(pagenum, self.final_index_page)
            pool.kill()

    def get_activity_streams(self, _id):
        cls = self.__class__

        endpoint = cls.GET_STREAMS_URL.format(dict(
            id=_id,
            keys=["time", "latlng"],
            type="true"
        ))

        url = cls.BASE_URL + endpoint
        try:
            response = requests.get(url, headers=self.headers())
            streams = response.json()

        except Exception:
            log.exception(
                "%s failed get streams for activity %s",
                self.user,
                _id
            )
            return False
        return streams


#  Activities class is only a proxy to underlying data structures.
#  There are no Activity objects
class Activities(object):
    name = "activities"
    db = mongodb.get_collection(name)

    @classmethod
    def init_db(cls, clear_cache=True):
        # Create/Initialize Activity database
        result = {}
        try:
            result["mongo_drop"] = mongodb.drop_collection(cls.name)
        except Exception as e:
            log.exception(
                "error deleting '%s' collection from MongoDB",
                cls.name
            )
            result["mongod_drop"] = str(e)

        if clear_cache:
            to_delete = redis.keys(cls.cache_key("*"))
            pipe = redis.pipeline()
            for k in to_delete:
                pipe.delete(k)

            result["redis"] = pipe.execute()

        result["mongo_create"] = mongodb.create_collection(cls.name)
        
        result = cls.db.create_index(
            "ts",
            name="ts",
            expireAfterSeconds=STORE_ACTIVITIES_TIMEOUT
        )
        log.info("initialized '{}' collection".format(cls.name))
        return result
        
    @classmethod 
    def update_ttl(cls, timeout=STORE_ACTIVITIES_TIMEOUT):

        # Update the MongoDB Activities TTL if necessary 
        info = cls.db.index_information()

        if "ts" not in info:
            cls.init_db()
            return

        current_ttl = info["ts"]["expireAfterSeconds"]

        if current_ttl != timeout:
            result = mongodb.command(
                'collMod',
                cls.name,
                index={
                    'keyPattern': {'ts': 1},
                    'background': True,
                    'expireAfterSeconds': timeout
                }
            )

            log.info("%s TTL updated: %s", cls.name, result)
        else:
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
        redis.setex(cls.cache_key(id), ttl, packed)

        document = {
            "ts": datetime.utcnow(),
            "mpk": Binary(packed)
        }
        try:
            cls.db.update_one(
                {"_id": int(id)},
                {"$set": document},
                upsert=True)
        except Exception:
            log.exception("failed mongodb write: activity %s", id)
        return

    @classmethod
    def get_many(cls, ids, ttl=CACHE_TTL, ordered=False):
        #  for each id in the ids iterable of activity-ids, this
        #  generator yields either a dict of streams
        #  or None if the streams for that activity are not in our
        #  stores.
        #  This generator uses batch operations to process the entire
        #  iterator of ids, so call it in chunks if ids iterator is
        #  a stream.

        # note we are creating a list from the entire iterable of ids!
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
        fetched = set()
        if notcached:
            # Attempt to fetch uncached activities from MongoDB
            try:
                query = {"_id": {"$in": notcached.keys()}}
                results = cls.db.find(query)
            except Exception:
                log.exception("Failed mongodb query: %s", query)
                return

            # iterate through results from MongoDB query
            for doc in results:
                id = int(doc["_id"])
                packed = doc["mpk"]

                # Store in redis cache
                write_pipe.setex(notcached[id], ttl, packed)
                fetched.add(id)

                yield (id, msgpack.unpackb(packed))

        # All fetched streams have been sent to the client
        # now we update the data-stores
        write_pipe.execute()

        if fetched:
            # now update TTL for mongoDB records if there were any
            now = datetime.utcnow()
            try:
                cls.db.update_many(
                    {"_id": {"$in": list(fetched)}},
                    {"$set": {"ts": now}}
                )
            except Exception:
                log.exception("Failed mongoDB update_many")

    @classmethod
    def get(cls, _id, ttl=CACHE_TTL):
        packed = None
        key = cls.cache_key(id)
        cached = redis.get(key)

        if cached:
            redis.expire(key, ttl)  # reset expiration timeout
            packed = cached
        else:
            try:
                document = cls.db.find_one_and_update(
                    {"_id": int(_id)},
                    {"$set": {"ts": datetime.utcnow()}}
                )

            except Exception:
                log.debug("Failed mongodb find_one_and_update %s", _id)
                return

            if document:
                packed = document["mpk"]
                redis.setex(key, ttl, packed)
        if packed:
            return msgpack.unpackb(packed)

    @classmethod
    def import_streams(cls, client, activity, timeout=CACHE_TTL):
        if cls.OFFLINE:
            return
 
        streams_to_import = list(STREAMS_TO_CACHE) + ["latlng"]
        try:
            streams_to_import.remove("polyline")
        except Exception:
            pass

        _id = activity["_id"]

        start = time.time()
        log.debug("request import %s", _id)

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
            # delete this activity from the index if it
            #  does not have the neccessary streams
            Index.delete(_id)
            log.info("activity %s EMPTY: %s", _id, e)
            return

        except Exception:
            log.exception(
                "error importing activity %s: %s", _id, activity
            )
            return False

        cls.set(_id, imported_streams, timeout)

        for s in STREAMS_OUT:
            try:
                activity[s] = imported_streams[s]
            except Exception:
                return False
        
        elapsed = round(time.time() - start, 2)
        log.debug("imported %s: elapsed=%s", _id, elapsed)
        return activity

    @classmethod
    def append_streams_from_db(cls, summaries):
        # adds actvity streams to an iterable of summaries
        #  summaries must be manageable by a single batch operation
        to_fetch = {}
        for A in summaries:
            if "_id" not in A:
                yield A
            else:
                to_fetch[A["_id"]] = A

        if not to_fetch:
            return

        for _id, stream_data in cls.get_many(to_fetch.keys()):
            A = to_fetch.pop(_id)
            if stream_data:
                A.update(stream_data)
            yield A

        for A in to_fetch.values():
            yield A

    @classmethod
    def append_streams_from_import(cls, summaries, client, pool=None):
        if pool is None:
            pool = Pool(IMPORT_CONCURRENCY)

        def import_activity_stream(A):
            if not A or "_id" not in A:
                return A
            imported = cls.import_streams(client, A)
            return imported
        
        return pool.imap_unordered(
            import_activity_stream,
            summaries,
            maxsize=BATCH_CHUNK_SIZE
        )

    @classmethod
    def query(cls, queryObj, cancel_key=None):
        for user_id in queryObj:
            user = Users.get(user_id)
            if not user:
                continue

            query = queryObj[user_id]
            activities = user.query_activities(cancel_key=cancel_key, **query)

            if activities:
                for a in activities:
                    yield a
        
        yield ""
        

class EventLogger(object):
    name = "history"
    db = mongodb.get_collection(name)

    @classmethod
    def init_db(cls, rebuild=True, size=app.config["MAX_HISTORY_BYTES"]):

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
            log.info("Initialized mongodb collection '%s'", cls.name)

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
            e["ts"] = Utility.to_epoch(e["ts"])
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
                cursor = cls.db.find(
                    {'ts': {'$gt': ts}},
                    cursor_type=pymongo.CursorType.TAILABLE_AWAIT
                )
                elapsed = 0
                while cursor.alive & redis.exists(genID):
                    for doc in cursor:

                        if not redis.exists(genID):
                            break

                        elapsed = 0
                        doc["ts"] = Utility.to_epoch(ts)
                        doc["_id"] = str(doc["_id"])
                        event = dumps(doc)

                        string = (
                            "id: {}\ndata: {}\n\n"
                            .format(doc["ts"], event)
                        )                        
                        yield string

                    # We end up here if the find() returned no
                    # documents or if the tailable cursor timed out
                    # (no new documents were added to the
                    # collection for more than 1 second)

                    gevent.sleep(1)
                    elapsed += 1
                    if elapsed > 10:
                        elapsed = 0
                        yield ": \n\n"

            Utility.del_genID(genID)
        return gen(ts)

    @classmethod
    def new_event(cls, **event):
        event["ts"] = datetime.utcnow()
        try:
            cls.db.insert_one(event)
        except Exception:
            log.exception("error inserting event %s", event)

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
            log.exception("error creating subscription")
            return dict(error=str(e))

        if "updates" not in mongodb.collection_names():
            mongodb.create_collection(
                "updates",
                capped=True,
                size=1 * 1024 * 1024
            )
        log.info("create_subscription: %s", subs)
        return dict(created=subs)

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
                cls.client.delete_subscription(
                    subscription_id,
                    **cls.credentials
                )
            except Exception as e:
                log.exception("error deleting webhook subscription")
                return dict(error=str(e))

            if delete_collection:
                mongodb.updates.drop()

            result = dict(
                success="deleted subscription {}".format(subscription_id)
            )
        else:
            result = dict(
                error="non-existent/incorrect subscription id"
            )
        log.info(result)
        return result

    @classmethod
    def list(cls):
        subs = cls.client.list_subscriptions(**cls.credentials)
        return [sub.id for sub in subs]

    @classmethod
    def handle_update_callback(cls, update_raw):

        update = cls.client.handle_subscription_update(update_raw)
        user_id = update.owner_id
        try:
            user = Users.get(user_id)
        except Exception:
            log.exception("problem fetching user for update %s", update_raw)
            return
            
        if (not user) or (not user.index_count()):
            return

        record = dict(
            dt=datetime.utcnow(),
            subscription_id=update.subscription_id,
            owner_id=update.owner_id,
            object_id=update.object_id,
            object_type=update.object_type,
            aspect_type=update.aspect_type,
            updates=update_raw.get("updates")
        )

        try:
            mongodb.updates.insert_one(record)
        except Exception:
            log.exception("mongodb error")
        
        if update.object_type == "athlete":
            return

        if update.aspect_type == "update":
            if update.updates:
                # update the activity if it exists
                result = Index.update(update.object_id, update.updates)
                if not result:
                    log.info(
                        "%s index update failed for update %s",
                        user,
                        update.updates
                    )
                    return

        #  If we got here then we know there are index entries 
        #  for this user
        if update.aspect_type == "create":
            # fetch activity and add it to the index
            Index.import_by_id(user, [update.object_id])

        elif update.aspect_type == "delete":
            # delete the activity from the index
            Index.delete(update.object_id)

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

            # create new indexes collection
            mongodb.create_collection(cls.name)
            cls.db.create_index([("ts", pymongo.DESCENDING)])
            cls.db.create_index([("user", pymongo.ASCENDING)])
        except Exception:
            log.exception("mongodb error for %s collection", cls.name)

        log.info("initialized '%s' collection", cls.name)

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
        elif isinstance(obj, int):
            return datetime.utcfromtimestamp(obj)
        try:
            dt = dateutil.parser.parse(obj, ignoretz=True)
        except ValueError:
            return
        else:
            return dt

    @staticmethod
    def to_epoch(dt):
        return int((dt - EPOCH).total_seconds())

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

    @staticmethod
    def chunks(iterable, size=10):
        chunk = []
        for thing in iterable:
            chunk.append(thing)
            if len(chunk) == size:
                yield chunk
                chunk = []
        if chunk:
            yield chunk
        

class BinaryWebsocketClient(object):
    # WebsocketClient is a wrapper for a websocket
    #  It attempts to gracefully handle broken connections
    def __init__(self, websocket, ttl=60 * 60 * 24):
        self.ws = websocket
        self.birthday = datetime.utcnow()

        # this is a the client_id for the web-page
        # accessing this websocket
        self.client_id = None
        
        bdsec = Utility.to_epoch(self.birthday)

        loc = "{REMOTE_ADDR}:{REMOTE_PORT}".format(**websocket.environ)
        
        self.key = "WS:{}".format(loc)
        
        redis.setex(self.key, ttl, bdsec)
        log.info("%s OPEN", self.key)

        self.send_key()

    def __repr__(self):
        return self.key

    # We send and receive json objects (dictionaries) encoded as strings
    def sendobj(self, obj):
        if not self.ws:
            return

        try:
            b = msgpack.packb(obj)
            self.ws.send(b, binary=True)
        except Exception:
            log.exception("error in sendobj")
            self.close()
            return

        return True

    def receiveobj(self):
        try:
            s = self.ws.receive()
            obj = json.loads(s)
        except TypeError:
            return
        except Exception:
            log.exception("error in receiveobj")
            return
        else:
            return obj

    def close(self):
        start_time = float(redis.get(self.key))
        elapsed = round(time.time() - start_time, 1)
        elapsed_td = timedelta(seconds=elapsed)
        log.info("%s CLOSED. elapsed=%s", self.key, elapsed_td)
        redis.delete(self.key)
        try:
            self.ws.close()
        except Exception:
            pass

    def send_key(self):
        self.sendobj(dict(wskey=self.key))

