"""StreamCodecs: the run-length-diff encoding must survive real stream data

Every case here round-trips, because a stream that encodes but decodes to
something else is worse than one that raises.
"""

import numpy as np
import pytest

from heatflask import StreamCodecs


def roundtrip(vals, expected_ntype=None):
    enc = StreamCodecs.rld_encode(vals)
    if expected_ntype is not None:
        assert enc[0] == expected_ntype
    assert list(StreamCodecs.rld_decode(enc)) == list(vals)
    return enc


def test_small_increasing_diffs_use_a_byte():
    roundtrip(list(range(0, 2000, 3)), StreamCodecs.NTYPE_U8)


def test_signed_small_diffs():
    vals = [100, 90, 95, 80, 85, 85, 85, 85, 85, 70]
    roundtrip(vals, StreamCodecs.NTYPE_I8)


def test_steps_too_big_for_a_byte():
    # a climb recorded across a pause: altitude jumps hundreds of metres
    vals = [1200, 1201, 1202, 1900, 1901, 1902]
    roundtrip(vals, StreamCodecs.NTYPE_I16)


def test_time_gap_too_big_for_an_int16():
    # the failure in production: a 32967-second gap in a time stream, which
    # is neither a byte nor an int16
    vals = [0, 10, 20, 30, 32997, 33007, 65999]
    roundtrip(vals, StreamCodecs.NTYPE_I32)


def test_first_value_too_big_for_an_int16():
    # tiny diffs, but the first value alone overflows the 16-bit header
    vals = [70000, 70001, 70002, 70003]
    roundtrip(vals, StreamCodecs.NTYPE_I32)


def test_negative_diff_at_the_int16_marker():
    # -32768 is the type-2 run-length marker, so this has to widen
    vals = [40000, 7232, 7233]
    roundtrip(vals, StreamCodecs.NTYPE_I32)


def test_long_runs_are_run_length_encoded():
    vals = list(range(0, 100000, 1000))  # a diff of 1000, repeated 99 times
    enc = roundtrip(vals, StreamCodecs.NTYPE_I16)
    # a run-length triple, not one diff per point
    assert len(enc) < 2 * len(vals)


def test_runs_longer_than_one_marker_can_count():
    # max_reps is 126, so a 400-long run needs several triples
    roundtrip([5 * i for i in range(400)], StreamCodecs.NTYPE_U8)


def test_float_stream_is_scaled_and_rounded():
    vals = [1.4, 2.6, 3.5]
    enc = StreamCodecs.rld_encode(vals, scale=10)
    assert list(StreamCodecs.rld_decode(enc)) == [14, 26, 35]


@pytest.mark.parametrize("seed", range(20))
def test_random_streams_roundtrip(seed):
    rng = np.random.default_rng(seed)
    n = int(rng.integers(3, 500))
    steps = rng.integers(-40000, 40000, size=n)
    vals = np.cumsum(steps, dtype="i4")
    enc = StreamCodecs.rld_encode(vals)
    assert list(StreamCodecs.rld_decode(enc)) == list(vals)
