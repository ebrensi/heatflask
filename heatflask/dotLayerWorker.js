

const data = {};

onmessage = function(event) {
    let msg = event.data;

    if ("hello" in msg){  
        data.name = msg.hello;
        postMessage(`Hello! ${name} at your service!`);
    }
};

