# Here we define a custom encoding/compression scheme for streams
# Run-Length-Diff encoding
#
#  It is RLE on successive differences, which in our case are small enough to
#  be 8 bit integers

import numpy as np

Nums = list[int] | list[float] | np.ndarray
RLDEncoded = bytes


def positive_non_decreasing(vals: Nums) -> bool:
    lastv = vals[0]
    if lastv < 0:
        return False

    i = 1
    while i < len(vals):
        if vals[i] < lastv:
            return False
        lastv = vals[i]
        i += 1
    return True


# Encoding types, stored in the first byte.
#   0: signed 8-bit diffs
#   1: unsigned 8-bit diffs (the values never decrease)
#   2: signed 16-bit diffs, for streams whose steps do not fit in a byte
NTYPE_I8 = 0
NTYPE_U8 = 1
NTYPE_I16 = 2

# ntype -> (numpy dtype, run-length marker, max repeat count)
SPECS = {
    NTYPE_I8: (np.int8, -128, 126),
    NTYPE_U8: (np.uint8, 255, 254),
    NTYPE_I16: (np.int16, -32768, 126),
}


def rld_encode(vals: Nums, scale: float = 1) -> RLDEncoded:
    vals = (
        np.fromiter((scale * v + 0.5 for v in vals), dtype="i4", count=len(vals))
        if type(vals[0]) is float
        else np.array(vals, dtype="i4")
    )

    increasing = positive_non_decreasing(vals)

    # choose a width that actually fits the data
    diffs = np.diff(vals) if len(vals) > 1 else np.zeros(0, dtype="i4")
    dmax = int(np.abs(diffs).max()) if len(diffs) else 0

    if increasing and dmax <= 254:
        ntype = NTYPE_U8
    elif dmax <= 127:
        # 127, not 128: a diff of -128 would be indistinguishable from the
        # signed run-length marker
        ntype = NTYPE_I8
    else:
        # A pause in recording can leave hundreds of metres between two
        # consecutive altitude samples. Those do not fit in a byte, and used
        # to raise OverflowError mid-stream, killing the whole response.
        ntype = NTYPE_I16

    my_dtype, rl_marker, max_reps = SPECS[ntype]

    n = len(vals)
    encoded = np.empty(n, dtype=my_dtype)
    reps = 0
    j = 0

    v = vals[1]
    d = v - vals[0]

    for i in range(2, len(vals)):
        next_v = vals[i]
        next_d = next_v - v

        if (d == next_d) and (reps < max_reps):
            reps += 1

        else:
            if reps == 0:
                encoded[j] = d
                j += 1
            elif reps <= 2:
                reps += 1
                while reps:
                    encoded[j] = d
                    j += 1
                    reps -= 1
            else:
                encoded[j] = rl_marker
                encoded[j + 1] = d
                encoded[j + 2] = reps + 1
                j += 3
                reps = 0
        d = next_d
        v = next_v

    if reps == 0:
        encoded[j] = d
        j += 1
    elif reps == 1:
        encoded[j] = d
        encoded[j + 1] = d
        j += 2
    else:
        encoded[j] = rl_marker
        encoded[j + 1] = d
        encoded[j + 2] = reps + 1
        j += 3

    firstval = np.array(vals[0], dtype=np.int16).tobytes()
    return bytes([ntype]) + firstval + encoded[:j].tobytes()


def decoded_length(enc: np.ndarray, rl_marker: int) -> int:
    L = 1
    i = 0
    while i < len(enc):
        if enc[i] == rl_marker:
            # int(): under numpy 2's NEP 50 rules `L += enc[i+2]` would make L
            # a uint8 and wrap it past 255
            L += int(enc[i + 2])
            i += 3
        else:
            L += 1
            i += 1
    return L


def rld_decode(enc: RLDEncoded, dtype=np.int32) -> Nums:
    ntype = int(np.frombuffer(enc, dtype="i1", count=1, offset=0)[0])
    start_val = int(np.frombuffer(enc, dtype="i2", count=1, offset=1)[0])

    np_dtype, rl_marker, _ = SPECS[ntype]

    # The diffs start at byte 3, an odd offset, so a 16-bit view of the
    # original buffer would be unaligned. Copy rather than view.
    enc_diffs = np.frombuffer(bytes(memoryview(enc)[3:]), dtype=np_dtype)

    L = decoded_length(enc_diffs, rl_marker)

    decoded = np.empty(L, dtype=dtype)
    decoded[0] = start_val
    cumsum = start_val
    i = 0  # enc_diffs counter
    j = 1  # decoded counter
    while i < len(enc_diffs):
        if enc_diffs[i] == rl_marker:
            # int() on every numpy scalar before it meets the running total:
            # under numpy 2, `cumsum += np.uint8(...)` demands that cumsum fit
            # in a uint8, so any start value over 255 raised OverflowError
            d = int(enc_diffs[i + 1])
            reps = int(enc_diffs[i + 2])
            endreps = j + reps
            while j < endreps:
                cumsum += d
                decoded[j] = cumsum
                j += 1
            i += 3
        else:
            cumsum += int(enc_diffs[i])
            decoded[j] = cumsum
            i += 1
            j += 1
    return decoded
