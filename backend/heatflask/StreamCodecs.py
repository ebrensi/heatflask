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


def rld_encode(vals: Nums) -> RLDEncoded:
    vals = (
        np.fromiter((v + 0.5 for v in vals), dtype="i4", count=len(vals))
        if type(vals[0]) is float
        else np.array(vals, dtype="i4")
    )

    increasing = positive_non_decreasing(vals)
    my_dtype = np.uint8 if increasing else np.int8
    rl_marker = 255 if increasing else -128
    max_reps = 254 if increasing else 126

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

    ntype = b"\x01" if increasing else b"\x00"
    firstval = np.array(vals[0], dtype=np.int16).tobytes()
    bytesdata = ntype + firstval + encoded[:j].tobytes()
    return bytesdata


def decoded_length(enc: np.ndarray, rl_marker: int) -> int:
    L = 1
    i = 0
    while i < len(enc):
        if enc[i] == rl_marker:
            L += enc[i + 2]
            i += 3
        else:
            L += 1
            i += 1
    return L


def rld_decode(enc: RLDEncoded, dtype=np.int32) -> Nums:
    ntype = np.frombuffer(enc, dtype="i1", count=1, offset=0)[0]
    start_val = np.frombuffer(enc, dtype="i2", count=1, offset=1)[0]
    enc_diffs = np.frombuffer(enc, dtype="i1" if ntype == 0 else "u1", offset=3)

    increasing = ntype != 0

    rl_marker = 255 if increasing else -128
    L = decoded_length(enc_diffs, rl_marker)

    decoded = np.empty(L, dtype=dtype)
    decoded[0] = start_val
    cumsum = start_val
    i = 0  # enc_diffs counter
    j = 1  # decoded counter
    while i < len(enc_diffs):
        if enc_diffs[i] == rl_marker:
            d = enc_diffs[i + 1]
            reps = enc_diffs[i + 2]
            endreps = j + reps
            while j < endreps:
                cumsum += d
                decoded[j] = cumsum
                j += 1
            i += 3
        else:
            cumsum += enc_diffs[i]
            decoded[j] = cumsum
            i += 1
            j += 1
    return decoded
