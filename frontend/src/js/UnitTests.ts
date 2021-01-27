/*
 * Unit testing is set up informally here to simplify the process.
 */

import * as StreamRLE from "./DotLayer/Codecs/StreamRLE"
import type { RLElist } from "./DotLayer/Codecs/StreamRLE"

function arraysEqual(arr1: number[], arr2: number[]): boolean {
  if (arr1.length !== arr2.length) return false
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false
  }
  return true
}

const result = (b: boolean) => (b ? "pass" : "fail")
function cumulativeSum(arr: number[]) {
  let sum = 0
  const sumArr = [sum]
  for (const num of arr) sumArr.push((sum += num))
  return sumArr
}

const log = console.log
log("testing StreamRLE")

const rleList: RLElist = [1, 2, 3, 6, [1, 4], 2]
const expandedRleList = [1, 2, 3, 6, 1, 1, 1, 1, 2]

const decodedRleList = Array.from(StreamRLE.decodeList(rleList))

log(`decodeList: ${result(arraysEqual(expandedRleList, decodedRleList))}`)

const decodedDiffList = Array.from(StreamRLE.decodeDiffList(rleList))
const decodedDiffListAnswer = cumulativeSum(expandedRleList)

log(
  `decodeDiffList: ${result(
    arraysEqual(decodedDiffList, decodedDiffListAnswer)
  )}`
)

const difbuf = StreamRLE.transcode2Buf(rleList)
const difbuf2 = StreamRLE.encodeDiffBuf(decodedDiffList.values())
log(`transcode/encode: ${result(arraysEqual(difbuf, difbuf2))}`)

const decodedDiffList2 = Array.from(StreamRLE.decodeDiffBuf(difbuf))
log(
  `decodeDiffList2: ${result(
    arraysEqual(decodedDiffListAnswer, decodedDiffList2)
  )}`
)

const exclude = new Set([2, 6])
// with exclusions

// with compression
