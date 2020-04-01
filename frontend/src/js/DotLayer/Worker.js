

const data = {};

const onmessage = function(event) {
    let msg = event.data;

    if ("hello" in msg){
        data.name = msg.hello;
        postMessage(`Hello! ${data.name} at your service!`);
    }
};

