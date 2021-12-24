from sqlalchemy.dialects import postgresql as pg
from flask_login import UserMixin
from sqlalchemy import inspect
from contextlib import contextmanager
from flask import current_app as app
import json
import time
import stravalib
import requests
import gevent
from datetime import datetime

from . import db_sql, redis
from .StravaClient import StravaClient
from .EventLogger import EventLogger
from .Index import Index
from .Activities import Activities
from .Utility import Utility, Timer, FakeQueue

log = app.logger

OFFLINE = app.config["OFFLINE"]
STRAVA_CLIENT_ID = app.config["STRAVA_CLIENT_ID"]
STRAVA_CLIENT_SECRET = app.config["STRAVA_CLIENT_SECRET"]
TRIAGE_CONCURRENCY = app.config["TRIAGE_CONCURRENCY"]
ADMIN = app.config["ADMIN"]
BATCH_CHUNK_SIZE = app.config["BATCH_CHUNK_SIZE"]
IMPORT_CONCURRENCY = app.config["IMPORT_CONCURRENCY"]
DAYS_INACTIVE_CUTOFF = app.config["DAYS_INACTIVE_CUTOFF"]
MAX_IMPORT_ERRORS = app.config["MAX_IMPORT_ERRORS"]

TTL_INDEX = app.config["TTL_INDEX"]
TTL_CACHE = app.config["TTL_CACHE"]
TTL_DB = app.config["TTL_DB"]


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
        info = {}
        info.update(vars(self))
        info["avatar"] = info["profile"]
        info["public"] = info["share_profile"]

        del info["share_profile"]
        del info["profile"]
        del info["_sa_instance_state"]
        del info["access_token"]

        if "activity_index" in info:
            del info["activity_index"]

        return info

    def client(self, refresh=True, session=db_sql.session):
        try:
            access_info = json.loads(self.access_token)
        except Exception:
            log.debug("%s using bad access_token", self)
            return

        if OFFLINE:
            return

        if not self.cli:
            self.cli = stravalib.Client(
                access_token=access_info.get("access_token"),
                rate_limiter=(lambda x=None: None),
            )

        now = time.time()
        one_hour = 60 * 60
        ttl = access_info["expires_at"] - now

        token_expired = ttl < one_hour
        start = now
        if (token_expired and refresh) or (refresh == "force"):

            # The existing access_token is expired
            # Attempt to refresh the token
            try:
                new_access_info = self.cli.refresh_access_token(
                    client_id=STRAVA_CLIENT_ID,
                    client_secret=STRAVA_CLIENT_SECRET,
                    refresh_token=access_info.get("refresh_token"),
                )

                self.access_token = json.dumps(new_access_info)

                try:
                    session.commit()
                except Exception:
                    log.exception("postgres error")

                self.cli = stravalib.Client(
                    access_token=new_access_info.get("access_token"),
                    rate_limiter=(lambda x=None: None),
                )
            except requests.exceptions.ConnectionError:
                log.error("can't refresh token. no network connection.")
            except Exception:
                log.exception("%s token refresh fail", self)
                self.cli = None
            else:
                elapsed = round(time.time() - start, 2)
                log.debug("%s token refresh elapsed=%s", self, elapsed)

        return self.cli

    def get_id(self):
        return str(self.id)

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

        if not client:
            return

        try:
            strava_user = client.get_athlete()
        except Exception:
            log.exception("error getting user '%s' data from token", user)
            return

        info = {
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
            "access_token": access_info_string,
        }

        # log.debug(strava_user.to_dict())
        # log.debug(info)
        return info

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

        log.info("%s deleted", self)

    def verify(
        self,
        days_inactive_cutoff=DAYS_INACTIVE_CUTOFF,
        update=True,
        session=db_sql.session,
        now=None,
    ):
        # cls = self.__class__

        now = now or datetime.utcnow()

        last_active = self.dt_last_active
        if not last_active:
            log.info("%s was never active", self)
            return

        days_inactive = (now - last_active).days

        if days_inactive >= days_inactive_cutoff:
            log.debug("%s inactive %s days > %s", self, days_inactive)
            return

        # if we got here then the user has been active recently
        #  they may have revoked our access, which we can only
        #  know if we try to get some data on their behalf
        if update and not OFFLINE:
            client = StravaClient(user=self)

            if client:
                log.debug("%s updated")
                return "updated"

            log.debug("%s can't create client", self)
            return
        return True

    @classmethod
    def triage(
        cls, days_inactive_cutoff=DAYS_INACTIVE_CUTOFF, delete=True, update=True
    ):
        with session_scope() as session:
            now = datetime.utcnow()
            stats = dict(count=0, invalid=0, updated=0, deleted=0)

            def verify_user(user):
                result = user.verify(
                    days_inactive_cutoff=days_inactive_cutoff,
                    update=update,
                    session=session,
                    now=now,
                )
                return (user, result)

            def handle_verify_result(verify_user_output):
                user, result = verify_user_output
                stats["count"] += 1
                if not result:
                    if delete:
                        user.delete(session=session)
                        # log.debug("...%s deleted")
                        stats["deleted"] += 1
                    stats["invalid"] += 1
                if result == "updated":
                    stats["updated"] += 1

                if not (stats["count"] % 1000):
                    log.info("triage: %s", stats)

            def when_done(dummy):
                msg = "Users db triage: {}".format(stats)
                log.debug(msg)
                EventLogger.new_event(msg=msg)
                log.info("Triage Done: %s", stats)

            P = gevent.pool.Pool(TRIAGE_CONCURRENCY + 1)

            results = P.imap_unordered(
                verify_user, cls.query, maxsize=TRIAGE_CONCURRENCY + 2
            )

            def do_it():
                for result in results:
                    handle_verify_result(result)

            return P.spawn(do_it).link(when_done)

    @classmethod
    def dump(cls, attrs, **filter_by):
        dump = [
            {attr: getattr(user, attr) for attr in attrs}
            for user in cls.query.filter_by(**filter_by)
        ]
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

        return Index.import_user_index(user=self, out_query=args, yielding=False)

    def query_activities(
        self,
        activity_ids=None,
        exclude_ids=[],
        limit=None,
        after=None,
        before=None,
        streams=False,
        owner_id=False,
        update_index_ts=True,
        cache_timeout=TTL_CACHE,
        **kwargs,
    ):

        # convert date strings to datetimes, if applicable
        if before or after:
            try:
                if after:
                    after = Utility.to_datetime(after)
                if before:
                    before = Utility.to_datetime(before)
                if before and after:
                    assert before > after
            except AssertionError:
                yield {"error": "Invalid Dates"}
                return

        client_query = Utility.cleandict(
            dict(limit=limit, after=after, before=before, activity_ids=activity_ids)
        )

        self.strava_client = None
        if not OFFLINE:
            self.strava_client = StravaClient(user=self)
            if not self.strava_client:
                yield {"error": "bad StravaClient. cannot import"}

        # exit if this query is empty
        if not any([limit, activity_ids, before, after]):
            log.debug("%s empty query", self)
            return

        while self.indexing():
            yield {"idx": self.indexing()}
            gevent.sleep(0.5)

        if self.index_count():
            summaries_generator = Index.query(
                user=self,
                exclude_ids=exclude_ids,
                update_ts=update_index_ts,
                **client_query,
            )

        else:
            # There is no activity index and we are to build one
            if OFFLINE:
                yield {"error": "cannot build index OFFLINE MODE"}
                return

            if not self.strava_client:
                yield {"error": "could not create StravaClient. authenticate?"}
                return

            summaries_generator = Index.import_user_index(
                out_query=client_query, client=self.strava_client
            )

            if not summaries_generator:
                log.info("Could not build index for %s", self)
                return

        # Here we introduce a mapper that readys an activity summary
        #  (with or without streams) to be yielded to the client
        now = datetime.utcnow()
        timer = Timer()
        self.abort_signal = False

        def export(A):
            if self.abort_signal:
                return
            if not A:
                return A

            # get an actvity object ready to send to client
            if "_id" not in A:
                # This is not an activity. It is
                #  an error message or something
                #  so pass it on.
                return A

            ttl = (A["ts"] - now).total_seconds() + TTL_INDEX
            A["ttl"] = max(0, int(ttl))

            try:
                ts_local = A.pop("ts_local")
                ts_UTC = A.pop("ts_UTC")

                ts_local = int(Utility.to_datetime(ts_local).timestamp())
                ts_UTC = int(Utility.to_datetime(ts_UTC).timestamp())
            except Exception:
                log.exception("%s, %s", ts_local, ts_UTC)

            # A["ts"] received by the client will be a tuple (UTC, diff)
            #  where UTC is the time of activity (GMT), and diff is
            #  hours offset so that
            #   ts_local= UTC + 3600 * diff
            A["ts"] = (ts_UTC, (ts_local - ts_UTC) / 3600)

            if owner_id:
                A.update(dict(owner=self.id, profile=self.profile))

            return A

        # if we are only sending summaries to client,
        #  get them ready to export and yield them
        count = 0
        if not streams:
            for A in map(export, summaries_generator):
                if A and "_id" in A:
                    count += 1
                abort_signal = yield A
                if abort_signal:
                    summaries_generator.send(abort_signal)
                    break
            log.debug("%s exported %s summaries in %s", self, count, timer.elapsed())
            return

        #  summaries_generator yields activity summaries without streams
        #  We want to attach a stream to each one, get it ready to export,
        #  and yield it.

        to_export = gevent.queue.Queue(maxsize=512)
        if self.strava_client:
            to_import = gevent.queue.Queue(maxsize=512)
            batch_queue = gevent.queue.Queue()
        else:
            to_import = FakeQueue()

        def import_activity_streams(A):
            if not (A and "_id" in A):
                return A

            if self.abort_signal:
                log.debug("%s import %s aborted", self, A["_id"])
                return

            start = time.time()
            _id = A["_id"]
            log.debug("%s request import %s", self, _id)

            A = Activities.import_streams(
                self.strava_client, A, batch_queue=batch_queue
            )

            elapsed = time.time() - start
            log.debug("%s response %s in %s", self, _id, round(elapsed, 2))

            if A:
                import_stats["n"] += 1
                import_stats["dt"] += elapsed

            elif A is False:
                import_stats["err"] += 1
                if import_stats["err"] >= MAX_IMPORT_ERRORS:
                    log.info("%s Too many import errors. quitting", self)
                    self.abort_signal = True
                    return
            else:
                import_stats["emp"] += 1

            return A

        # this is where the action happens
        stats = dict(n=0)
        import_stats = dict(n=0, err=0, emp=0, dt=0)

        import_pool = gevent.pool.Pool(IMPORT_CONCURRENCY)
        aux_pool = gevent.pool.Pool(3)

        if self.strava_client:
            # this is a lazy iterator that pulls activites from import queue
            #  and generates activities with streams. Roughly equivalent to
            #   imported = ( import_activity_streams(A) for A in to_import )
            imported = import_pool.imap_unordered(import_activity_streams, to_import)

            def handle_imported(imported):
                for A in imported:
                    if A and not self.abort_signal:
                        to_export.put(A)

            def imported_done(result):
                if import_stats["n"]:
                    import_stats["resp"] = round(
                        import_stats["dt"] / import_stats["n"], 2
                    )
                log.debug("%s done importing", self)
                to_export.put(StopIteration)

            # this background job fills export queue
            # with activities from imported
            aux_pool.spawn(handle_imported, imported).link(imported_done)

        # background job filling import and export queues
        #  it will pause when either queue is full
        chunks = Utility.chunks(summaries_generator, size=BATCH_CHUNK_SIZE)

        def process_chunks(chunks):
            for chunk in chunks:
                handle_raw(chunk)

        def handle_raw(raw_summaries):
            for A in Activities.append_streams_from_db(raw_summaries):
                handle_fetched(A)

        def handle_fetched(A):
            if not A or self.abort_signal:
                return
            if "time" in A:
                to_export.put(A)
                stats["n"] += 1
            elif "_id" not in A:
                to_export.put(A)
            else:
                to_import.put(A)

        def raw_done(dummy):
            # The value of result will be False
            log.debug("%s done with raw summaries. elapsed=%s", self, timer.elapsed())

            if self.strava_client:
                to_import.put(StopIteration)
            else:
                to_export.put(StopIteration)

        aux_pool.spawn(process_chunks, chunks).link(raw_done)

        count = 0
        for A in map(export, to_export):
            self.abort_signal = yield A
            count += 1

            if self.abort_signal:
                log.info("%s received abort_signal. quitting...", self)
                summaries_generator.send(abort_signal)
                break

        elapsed = timer.elapsed()
        stats["dt"] = round(elapsed, 2)
        stats = Utility.cleandict(stats)
        import_stats = Utility.cleandict(import_stats)
        if import_stats:
            batch_queue.put(StopIteration)
            write_result = Activities.set_many(batch_queue)
            try:
                import_stats["t_rel"] = round(import_stats.pop("dt") / elapsed, 2)
                import_stats["rate"] = round(import_stats["n"] / elapsed, 2)
            except Exception:
                pass
            log.info("%s import %s", self, import_stats)

        if "n" in stats:
            log.info("%s fetch %s", self, stats)

        if import_stats:
            stats["import"] = import_stats

        if ("n" in stats) or import_stats:
            EventLogger.new_event(msg="{} fetch {}".format(self, stats))
