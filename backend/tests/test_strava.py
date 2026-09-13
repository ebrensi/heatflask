"""The Strava client's import paths: index paging and streams"""

import asyncio

from heatflask import Strava

from conftest import make_client


async def test_index_pages_in_order_and_stops_at_the_short_page(limiter, strava_server):
    fake = await strava_server(n_activities=450)
    ids = [A["id"] async for A in make_client().get_all_activities()]
    assert ids == list(range(450))
    # page 1 alone, then pages 2-5 together; page 3 is the short one
    assert fake.requests == 5


async def test_index_of_one_page_costs_one_request(limiter, strava_server):
    fake = await strava_server(n_activities=150)
    ids = [A["id"] async for A in make_client().get_all_activities()]
    assert ids == list(range(150))
    assert fake.requests == 1


async def test_index_is_not_capped_at_9800(limiter, strava_server):
    fake = await strava_server(n_activities=10_050, latency=0)
    ids = [A["id"] async for A in make_client().get_all_activities()]
    assert len(ids) == 10_050
    assert fake.requests <= 51 + Strava.PAGE_BATCH


async def test_closing_streams_import_stops_unsent_requests(limiter, strava_server):
    fake = await strava_server(latency=0.3)
    it = make_client().get_many_streams(list(range(200)))
    got = 0
    async for _ in it:
        got += 1
        if got == 5:
            break
    await it.aclose()

    at_close = fake.requests
    await asyncio.sleep(1.0)
    assert fake.requests == at_close
    assert at_close <= 25  # a couple of batches of 10, not 200


async def test_closing_keeps_streams_that_arrived_but_were_not_yielded(
    limiter, strava_server
):
    await strava_server(latency=0.2)
    leftovers = []
    it = make_client().get_many_streams(list(range(100)), leftovers=leftovers)

    first = await anext(it)
    # let the other in-flight requests finish while nobody is reading
    await asyncio.sleep(0.5)
    await it.aclose()

    leftover_ids = {aid for aid, _ in leftovers}
    assert first[0] not in leftover_ids
    assert len(leftovers) >= 9  # the rest of the first batch of 10, at least
    assert all(streams for _, streams in leftovers)


async def test_requests_already_sent_are_allowed_to_finish(limiter, strava_server):
    fake = await strava_server(latency=0.5)
    leftovers = []
    it = make_client().get_many_streams(list(range(100)), leftovers=leftovers)

    task = asyncio.ensure_future(anext(it))
    await asyncio.sleep(0.1)  # ten requests are out, none has come back
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)
    await it.aclose()

    assert fake.requests == 10
    assert len(leftovers) == 10


async def test_activities_without_streams_are_skipped(limiter, strava_server):
    fake = await strava_server()
    fake.no_streams = {3, 4}
    got = {aid async for aid, _ in make_client().get_many_streams(list(range(10)))}
    assert got == set(range(10)) - {3, 4}
