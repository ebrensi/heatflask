/*
 * Here we define the Websocket interface with the backend server
 */

import { BEACON_HANDLER_URL, WEBSOCKET_URL, CLIENT_ID } from "./Init.js";

import PersistentWebSocket from "pws";
import { decode } from "@msgpack/msgpack";

export let sock, wskey;


/**
 * The default export of this module is a function that imports messagepack
 *   encoded objects from the backend, executing the given callback with each
 *   imported data item.
 *
 * @param {Object} query - the data query, as specified by our backend API
 * @param {function} [callback] - A function that processes one imported data item
 * @param {function} [done] - Called when we receive a null message
 */
export default function (query, callback, done) {
  if (sock && sock.readyState < 2) {
    if (query) {
      sendQuery(query);
    } else {
      closeSocket();
    }
  } else {
    let A;

    sock = new PersistentWebSocket(WEBSOCKET_URL, {
      // pingTimeout: 30 * 1000, // Reconnect if no message received in 30s.
    });

    sock.binaryType = "arraybuffer";

    sock.onopen = () => sendQuery(query);

    sock.onmessage = (event) => {
      try {
        A = decode(new Uint8Array(event.data));
      } catch (err) {
        console.log(event);
        console.log(event.data);
        console.log(err);
        callback();
        return;
      }

      if (!A) {
        done && done();
        return;
      }

      if ("wskey" in A) {
        wskey = A["wskey"];
      } else if ("error" in A) {
        console.log(`import error: ${A["error"]}`);
      } else {
        callback && callback(A);
      }
    };
  }
}

function sendQuery(query) {
  sock.send(
    JSON.stringify({
      client_id: CLIENT_ID,
      query: query,
    })
  );
}

function closeSocket() {
  if (!sock || sock.readyState !== 1) {
    return;
  }

  sock.send(JSON.stringify({ close: 1 }));
  sock.close();
  if (navigator.sendBeacon && wskey) {
    navigator.sendBeacon(BEACON_HANDLER_URL, wskey);
  }
  wskey = null;
}


window.addEventListener("beforeunload", () => {
  if (navigator.sendBeacon) {
    if (wskey) {
      navigator.sendBeacon(BEACON_HANDLER_URL, wskey);
    }
    navigator.sendBeacon(BEACON_HANDLER_URL, CLIENT_ID);
  }

  closeSocket();
});
