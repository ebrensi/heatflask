/*
 * Data.js -- Here we define the functionality for getting the activity data
 *          that we use for vizualization.  That means, importing
 *          it from the backend or local storage.
 */

import { BEACON_HANDLER_URL, WEBSOCKET_URL, CLIENT_ID } from "./Init.js"

import PersistentWebSocket from "../ext/js/pws.js";
import { decode } from "@msgpack/msgpack";

let sock, wskey;


/**
 * The default export of this module is a function that imports messagepack
 *   encoded objects from the backend, executing the given callback with each
 *   imported data item.
 *
 * @param {Object} query - the data query, as specified by our backend API
 * @param {function} callback - A function that processes one imported data item
 */
export default function(query, callback) {

    if (sock && sock.readyState < 2) {
        if (query) {
            sendQuery(query);

        } else {
            closeSocket();
        }

    } else {
        let A;

        sock = new PersistentWebSocket(WEBSOCKET_URL);

        sock.binaryType = 'arraybuffer';

        sock.onopen = () => sendQuery(query);

        sock.onmessage = (event) => {

            try {
                A = decode(new Uint8Array(event.data));
            }
            catch(err) {
                console.log(event);
                console.log(event.data);
                console.log(err);
                callback(null);
                return;
            }

            if ("wskey" in A) {
                wskey = A['wskey'];
            }
            callback(A);
        };
    }
}


function sendQuery(query) {
    sock.send(JSON.stringify({
        client_id: CLIENT_ID,
        query: query
    }));
}

function closeSocket() {
    if (!sock) {
        return
    }

    sock.send(JSON.stringify({close: 1}));
    sock.close();
    if (navigator.sendBeacon && wskey) {
        navigator.sendBeacon(BEACON_HANDLER_URL, wskey);
    }
    wskey = null;
}

