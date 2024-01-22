
DotLayer.WorkerPool = {

    _workers: [],

    initialize: function (numWorkers, url) {
        if (numWorkers == 0)
            return

        if (!window.Worker) {
            console.log("This browser apparently doesn\'t support web workers");
            return;
        }

        if (!numWorkers)
            numWorkers = window.navigator.hardwareConcurrency;

        this.currentWorker = 0;

        for (let i = 0; i < numWorkers; i++) {
            const worker = new this.Worker(url);
            this._workers.push(worker);
            worker.post({ hello: `worker_${i}` }).then(msg => console.log(msg));
        }
    },

    // Worker class wraps a JavaScript Worker
    Worker: function (url) {
        this.worker = new Worker(url);

        this.post = function (msg, transferables) {
            return new Promise(resolve => {
                this.worker.onmessage = event => resolve(event.data);
                this.worker.postMessage(msg, transferables);
            });
        }
    },

    nextWorker: async function () {
        while (!this._workers.length)
            await this._delay(20);
        return this._workers.pop();
    },

    post: async function (msg, transferables) {
        const worker = await this.nextWorker();
        return worker.post(msg, transferables);
    },

    postAll: function (msg) {
        const promises = this._workers.map(worker => worker.postMessage(msg));
        return Promise.all(promises);
    },

    _delay: function (timer) {
        return new Promise(resolve => {
            timer = timer || 1000;
            setTimeout(function () {
                resolve();
            }, timer);
        });
    }
};