/*
 *  This module contains the code for capturing an animation cycle,
 *  encoding it into GIF or other format, and exporting the file
 *  to the user's machine or anywhere else.
 */

import * as leafletImage from "leaflet-image"
import * as GIF from "gif.js"
import * as download from "downloadjs"
import * as ViewBox from "./ViewBox"
import { dotLayer } from "../DotLayerAPI.js"

import heatflaskImgSrc from "url:../../images/logo.png"
import stravaImgSrc from "url:../../images/pbs4.png"

const progressDisplay = document.createElement("div")
progressDisplay.style.update({
  display: "none",
  position: "absolute",
  left: 0,
  top: 0,
  backgroundColor: "black",
  fontFamily: "monospace",
  fontSize: "20px",
  padding: "5px",
  color: "white",
  zIndex: 100000,
})
document.body.appendChild(progressDisplay)

const heatflaskImg = new Image()
heatflaskImg.src = heatflaskImgSrc

const stravaImg = new Image()
stravaImg.src = stravaImgSrc

let encoder

function display(canvas, title) {
  let w = open(canvas.toDataURL("image/png"), "_blank")
  w.document.write(`<title>${title}</title>`)
}

export function captureCycle(dotLayer, selection, callback) {
  let periodInSecs = dotLayer.periodInSecs()
  dotLayer._capturing = true

  // enable progress display
  progressDisplay.textContent =
    "loading map baseLayer (may take several seconds)..."
  progressDisplay.style.display = "block"
  // console.log(msg);

  leafletImage(ViewBox._map, function (err, canvas) {
    // download(canvas.toDataURL("image/png"), "mapViewBox.png", "image/png");
    // console.log("leaflet-image: " + err);
    if (canvas) {
      captureGIF(selection, canvas, periodInSecs, callback)
    }
  })
}

function canvasSubtract(newCanvas, oldCanvas, sw, sh) {
  if (!oldCanvas) {
    return newCanvas
  }
  let ctxOld = oldCanvas.getContext("2d"),
    dataOld = ctxOld.getImageData(0, 0, sw, sh),
    dO = dataOld.data,
    ctxNew = newCanvas.getContext("2d"),
    dataNew = ctxNew.getImageData(0, 0, sw, sh),
    dN = dataNew.data,
    len = dO.length

  if (dN.length != len) {
    console.log("canvasDiff: canvases are different size")
    return
  }
  for (let i = 0; i < len; i += 4) {
    if (
      dO[i] == dN[i] &&
      dO[i + 1] == dN[i + 1] &&
      dO[i + 2] == dN[i + 2] &&
      dO[i + 3] == dN[i + 3]
    ) {
      dO[i] = 0
      dO[i + 1] = 0
      dO[i + 2] = 0
      dO[i + 3] = 0
    } else {
      dO[i] = dN[i]
      dO[i + 1] = dN[i + 1]
      dO[i + 2] = dN[i + 2]
      // dO[i+3] = dN[i+3];
      // console.log(dN[i+3]);
      dO[i + 3] = 255
    }
  }
  ctxOld.putImageData(dataOld, 0, 0)
  return oldCanvas
}

/*
 * For GIF encoding
 */

function captureGIF(selection, baseCanvas, durationSecs, callback) {
  let sx, sy, sw, sh
  if (selection) {
    sx = selection.topLeft.x
    sy = selection.topLeft.y
    sw = selection.width
    sh = selection.height
  } else {
    sx = sy = 0
    sw = ViewBox.size.x
    sh = ViewBox.size.y
  }

  // set up GIF encoder
  let frameTime = Date.now(),
    // we use a frame rate of 25 fps beecause that yields a nice
    //  4 1/100-th second delay between frames
    frameRate = 25,
    numFrames = durationSecs * frameRate,
    delay = 1000 / frameRate,
    encoder = new GIF({
      workers: window.navigator.hardwareConcurrency,
      quality: 8,
      transparent: "rgba(0,0,0,0)",
    })

  encoder.on(
    "progress",
    (p) => (progressDisplay.textContent = `Encoding frames...${~~(p * 100)}%`)
  )

  encoder.on("finished", (blob) => {
    // window.open(URL.createObjectURL(blob));

    if (blob) {
      download(blob, "output.gif", "image/gif")
    }

    progressDisplay.style.display = "none"

    dotLayer._capturing = false

    if (!dotLayer._paused) {
      dotLayer.animate()
    }
    if (callback) {
      callback()
    }
  })

  // console.log(`GIF output: ${numFrames.toFixed(4)} frames, delay=${delay.toFixed(4)}`);
  let h1 = heatflaskImg.height,
    w1 = heatflaskImg.width,
    himg = [50, (h1 * 50) / w1],
    hd = [2, sh - himg[0] - 2, himg[0], himg[1]],
    h2 = stravaImg.height,
    w2 = stravaImg.width,
    simg = [50, (h2 * 50) / w2],
    sd = [sw - simg[0] - 2, sh - simg[1] - 2, simg[0], simg[1]]

  let framePrev = null
  // Add frames to the encoder
  for (let i = 0, num = ~~numFrames; i < num; i++, frameTime += delay) {
    let msg = `Rendering frames...${~~((i / num) * 100)}%`

    // let timeOffset = (dotLayer.dotSettings._timeScale * frameTime) % dotLayer._period;
    // console.log( `frame${i} @ ${timeOffset}`);

    progressDisplay.textContent = msg

    // create a new canvas
    const frame = document.createElement("canvas")
    frame.width = sw
    frame.height = sh

    const frameCtx = frame.getContext("2d")

    // clear the frame
    frameCtx.clearRect(0, 0, sw, sh)

    // lay the baselayer down
    baseCanvas && frameCtx.drawImage(baseCanvas, sx, sy, sw, sh, 0, 0, sw, sh)

    // render this set of dots
    dotLayer.drawDots(frameTime)

    // draw dots onto frame
    frameCtx.drawImage(dotLayer._dotCanvas, sx, sy, sw, sh, 0, 0, sw, sh)

    // Put Heatflask and Strava attribution images on the frame
    let ga = frameCtx.globalAlpha
    frameCtx.globalAlpha = 0.3
    frameCtx.drawImage(heatflaskImg, hd[0], hd[1], hd[2], hd[3])
    frameCtx.drawImage(stravaImg, sd[0], sd[1], sd[2], sd[3])
    frameCtx.globalAlpha = ga

    let gifFrame = canvasSubtract(frame, framePrev, sw, sh)
    // display(gifFrame, `frame_${i}`);

    let thisDelay = i == num - 1 ? ~~(delay / 2) : delay
    // console.log("frame "+i+": delay="+thisDelay);

    encoder.addFrame(gifFrame, {
      copy: true,
      // shorter delay after final frame
      delay: thisDelay,
      transparent: i == 0 ? null : "#F0F0F0",
      dispose: 1, // leave as is
    })

    framePrev = frame
  }

  // encode the Frame array
  encoder.render()
}

export function abortCapture() {
  if (!encoder) return

  // console.log("capture aborted");
  progressDisplay.textContent = "aborting..."
  encoder.abort()
  progressDisplay.style.display = "none"

  dotLayer._capturing = false
  if (!dotLayer._paused) {
    dotLayer.animate()
  }
}
