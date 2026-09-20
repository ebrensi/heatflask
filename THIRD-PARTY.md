# Third-party code in this repository

Heatflask is licensed under the GNU Affero General Public License v3.0 or later
(see [`/LICENSE`](./LICENSE)). A few source files are adapted from other
people's work under permissive licenses. Those licenses are compatible with the
AGPL, and their terms require that the original copyright notice and disclaimer
travel with the code. This file records them; each adapted file also carries a
short notice in its header.

Nothing here restricts Heatflask's own license. It records obligations
Heatflask owes upstream.

| File | Adapted from | Copyright | License |
| --- | --- | --- | --- |
| `frontend/src/js/DotLayer/Simplifier.ts` | [simplify.js](https://github.com/mourner/simplify-js) | (c) 2017, Vladimir Agafonkin | BSD-2-Clause |
| `frontend/src/js/DotLayer/CRS.ts` | [Leaflet](https://github.com/Leaflet/Leaflet) | (c) 2010-2026, Volodymyr Agafonkin; (c) 2010-2011, CloudMade | BSD-2-Clause |
| `frontend/src/js/BitSet.ts` | [TypedFastBitSet.js](https://github.com/lemire/TypedFastBitSet.js) | (c) Daniel Lemire | Apache-2.0 |
| `frontend/src/js/VByte.ts` | [FastIntegerCompression.js](https://github.com/lemire/FastIntegerCompression.js) | (c) Daniel Lemire | Apache-2.0 |
| `frontend/src/js/Polyline.ts` | [Project-OSRM](https://github.com/Project-OSRM/osrm-backend), and PolylineEncoder.js by Mark McClure | (c) 2017, Project OSRM contributors | BSD-2-Clause |

## Full license texts

### BSD 2-Clause (simplify.js, Leaflet, Project-OSRM)

> Redistribution and use in source and binary forms, with or without
> modification, are permitted provided that the following conditions are met:
>
> 1. Redistributions of source code must retain the above copyright notice,
>    this list of conditions and the following disclaimer.
> 2. Redistributions in binary form must reproduce the above copyright notice,
>    this list of conditions and the following disclaimer in the documentation
>    and/or other materials provided with the distribution.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
> AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
> IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
> ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
> LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
> CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
> SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
> INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
> CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
> ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
> POSSIBILITY OF SUCH DAMAGE.

### Apache 2.0 (TypedFastBitSet.js, FastIntegerCompression.js)

The full text is at <https://www.apache.org/licenses/LICENSE-2.0>. The adapted
files are modifications of the originals, as Section 4 of that license
requires them to state.

## Runtime dependencies

Dependencies installed from npm and PyPI are not vendored here and keep their
own licenses; see `frontend/package.json` and `backend/requirements.txt`. As of
this writing the frontend's runtime dependencies are MapLibre GL JS
(BSD-3-Clause), sidebar-v2 (MIT), latlon-geohash (MIT), @msgpack/msgpack (ISC)
and mediabunny (MPL-2.0). MPL-2.0 is a file-level copyleft: modifications to
mediabunny's own files would have to be published under MPL-2.0.
