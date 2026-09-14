"""
Users.migrate() against a Postgres table laid out exactly like production's
(column order from `\\d users` on the heatflask Heroku app, 2026-09-13).

Needs TEST_POSTGRES_URL pointing at a throwaway database, plus
requirements-migrate.txt installed; skips otherwise. The table is created and
dropped here.
"""

import datetime
import json
import os

import pytest

from heatflask import Users

U = Users.U

PGURL = os.environ.get("TEST_POSTGRES_URL")
sqlalchemy = pytest.importorskip("sqlalchemy")
pytestmark = pytest.mark.skipif(not PGURL, reason="TEST_POSTGRES_URL not set")

# Production's column order: dt_indexed sits between dt_last_active and
# app_activity_count
SCHEMA = """
create table users (
    id integer primary key,
    username varchar,
    firstname varchar,
    lastname varchar,
    profile varchar,
    access_token varchar,
    measurement_preference varchar,
    city varchar,
    state varchar,
    country varchar,
    email varchar,
    dt_last_active timestamp without time zone,
    dt_indexed timestamp without time zone,
    app_activity_count integer,
    share_profile boolean
)
"""

AUTH = {"access_token": "a", "refresh_token": "r", "expires_at": 1700000000}
LAST_ACTIVE = datetime.datetime(2025, 6, 1, 12, 0, 0)  # naive, as utcnow() wrote it


class Collection:
    def __init__(self):
        self.docs = {}

    async def delete_many(self, query):
        for i in query[U.ID]["$in"]:
            self.docs.pop(i, None)

    async def insert_many(self, docs):
        for d in docs:
            self.docs[d[U.ID]] = d

        class Result:
            inserted_ids = [d[U.ID] for d in docs]

        return Result()


@pytest.fixture
def legacy_db(monkeypatch):
    from sqlalchemy import create_engine, text

    engine = create_engine(PGURL)
    rows = [
        # shared profile, 42 activities
        dict(id=1, share=True, count=42, token=json.dumps(AUTH), active=LAST_ACTIVE),
        # private profile with a nonzero count: the case positional unpacking
        # turned public
        dict(id=2, share=False, count=7, token=json.dumps(AUTH), active=LAST_ACTIVE),
        # never active: skipped
        dict(id=3, share=True, count=0, token=json.dumps(AUTH), active=None),
        # unparseable token: skipped
        dict(id=4, share=True, count=1, token="not json", active=LAST_ACTIVE),
        # admin: skipped
        dict(id=Users.ADMIN[0], share=True, count=1, token=json.dumps(AUTH), active=LAST_ACTIVE),
    ]
    with engine.begin() as conn:
        conn.execute(text("drop table if exists users"))
        conn.execute(text(SCHEMA))
        for r in rows:
            conn.execute(
                text(
                    "insert into users values (:id, 'u', 'First', 'Last', 'pic',"
                    " :token, 'meters', 'City', 'ST', 'US', 'e@x',"
                    " :active, :indexed, :count, :share)"
                ),
                dict(r, indexed=datetime.datetime(2020, 1, 1)),
            )

    coll = Collection()

    async def get_collection():
        return coll

    monkeypatch.setenv("LEGACY_POSTGRES_URL", PGURL)
    monkeypatch.setattr(Users, "get_collection", get_collection)
    yield coll
    with engine.begin() as conn:
        conn.execute(text("drop table users"))


async def test_fields_land_in_the_right_place(legacy_db):
    await Users.migrate()

    assert sorted(legacy_db.docs) == [1, 2]

    shared, private = legacy_db.docs[1], legacy_db.docs[2]
    assert shared[U.PRIVATE] is False
    assert private[U.PRIVATE] is True
    assert shared[U.LOGIN_COUNT] == 42
    assert private[U.LOGIN_COUNT] == 7
    assert shared[U.AUTH] == AUTH
    assert (shared[U.FIRSTNAME], shared[U.CITY], shared[U.COUNTRY]) == ("First", "City", "US")


async def test_last_login_is_read_as_utc(legacy_db):
    await Users.migrate()

    expected = LAST_ACTIVE.replace(tzinfo=datetime.timezone.utc).timestamp()
    assert legacy_db.docs[1][U.LAST_LOGIN] == expected
