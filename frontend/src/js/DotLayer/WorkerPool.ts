let _workers = []

export function initialize(numWorkers) {
  if (numWorkers == 0) return

  if (!window.Worker) {
    console.log("This browser apparently doesn't support web workers")
    return
  }

  if (!numWorkers) numWorkers = window.navigator.hardwareConcurrency

  for (let i = 0; i < numWorkers; i++) {
    const worker = new _Worker()
    _workers.push(worker)
    worker.post({ hello: `worker_${i}` }).then((msg) => console.log(msg))
  }
}

/**
 * Worker class wraps a JavaScript Worker
 * @class
 */
function _Worker() {
  this.worker = new Worker("./Worker.js")

  this.post = function (msg, transferables) {
    return new Promise((resolve) => {
      this.worker.onmessage = (event) => resolve(event.data)
      this.worker.postMessage(msg, transferables)
    })
  }
}

async function nextWorker() {
  while (!_workers.length) await _delay(20)
  return _workers.pop()
}

export async function post(msg, transferables) {
  const worker = await nextWorker()
  return worker.post(msg, transferables)
}

export function postAll(msg) {
  const promises = _workers.map((worker) => worker.postMessage(msg))
  return Promise.all(promises)
}

function _delay(timer) {
  return new Promise((resolve) => {
    timer = timer || 1000
    setTimeout(function () {
      resolve()
    }, timer)
  })
}
