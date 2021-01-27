/*
 * Unit testing is set up informally here to simplify the process.
 */

import * as StreamRLE from "./DotLayer/Codecs/StreamRLE"
import type { RLElist } from "./DotLayer/Codecs/StreamRLE"

function arraysEqual(arr1: number[], arr2: number[]): boolean {
  if (arr1.length !== arr2.length) return false
  for (let i = 0; i<arr1.length; i++) {
      if (arr1[i] !== arr2[i]) return false
  }
  return true
}

const result = (b: boolean) => b? "pass" : "fail"

const log = console.log
log("testing StreamRLE")

const rleList: RLElist = [1, 2, 3, 6, [1, 4], 2]

const expandedRleList = [1, 2, 3, 6, 1, 1, 1, 1, 2]
const decodedRleList = Array.from(StreamRLE.decodeList(rleList))

log(`decodeList: ${result(arraysEqual(expandedRleList, decodedRleList))}`)

const decodedDiffList = Array.from(StreamRLE.decodeDiffList(rleList))
const decodedDiffListAnswer = [0, 1, 3, 6, 12, 13, 14, 15, 16, 18]

log(`decodeDiffList: ${result(arraysEqual(decodedDiffList, decodedDiffListAnswer))}`)

const buf = StreamRLE.transcode2Buf(rleList)

const buf2 = StreamRLE.encodeDiffBuf( decodedDiffList.values() )
log({buf, buf2})
log(`transcode/encode: ${result(arraysEqual(buf, buf2))}`)
