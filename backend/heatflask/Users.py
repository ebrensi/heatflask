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

from logging import getLogger
import datetime

from DataAPIs import redis, init_collection
from . import Index

log = getLogger(__name__)
log.propagate = True

APP_NAME = "heatflask"
COLLECTION_NAME = "users"
CACHE_PREFIX = "U:"

# Drop a user after a year of inactivity
MONGO_TTL = 365 * 24 * 3600

ADMIN = [15972102]

DATA = {}


async def get_collection():
    if "col" not in DATA:
        DATA["col"] = await init_collection(
            COLLECTION_NAME, force=False, ttl=MONGO_TTL, cache_prefix=CACHE_PREFIX
        )
    return DATA["col"]


def mongo_doc(
    # From Strava Athlete record
    id=None,
    username=None,
    firstname=None,
    lastname=None,
    profile_medium=None,
    profile=None,
    measurement_preference=None,
    city=None,
    state=None,
    country=None,
    email=None,
    # my additions
    _id=None,
    ts=None,
    auth=None,
    access_count=None,
    private=None,
):
    doc = {
        "_id": int(_id or id),
        "username": username,
        "firstname": firstname,
        "lastname": lastname,
        "profile": profile_medium or profile,
        "units": measurement_preference,
        "city": city,
        "state": state,
        "country": country,
        "email": email,
        #
        "ts": ts or datetime.datetime.utcnow(),
        "access_count": access_count or 0,
        "auth": auth,
        "private": private or False,
    }

    # Filter out any entries with None values
    return {k: v for k, v in doc.items() if v is not None}


async def add_or_update(**userdict):
    users = get_collection()
    doc = mongo_doc(**userdict)

    # Creates a new user or updates an existing user (with the same id)
    try:
        return await users.update_one({"_id": doc["_id"]}, doc, upsert=True)
    except Exception:
        log.exception("error adding/updating user: %s", doc)


async def get(user_id):
    users = get_collection()
    try:
        doc = await users.find_one({"_id": user_id})
    except Exception:
        log.exception("Failed mongodb query")
        doc = None
    return doc


async def delete(user_id):
    users = get_collection()
    uid = int(user_id)
    try:
        await users.delete_one({"_id": int(uid)})
        await Index.delete_user_entries(uid)

    except Exception:
        log.exception("error deleting user %d", user_id)


"""

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
"""
