/*
 * This is the script for the heatflask activity-list view
 * activities.html.
 */
import { DataTable } from "simple-datatables";
import "../../node_modules/simple-datatables/src/style.css";


// msgpack is how we encode data for transfer over websocket
import { decode } from "@msgpack/msgpack";

// css for Bundler
import "../ext/css/min_entireframework.min.css";
import "../css/font-awesome-lite.css";

// JS module imports
// import * as localForage from "localforage";

import * as strava from './strava.js';
import { WS_SCHEME, DDHHMM, img, href, noop }   from './appUtil.js';
import load_ga_object from "./google-analytics.js";

// _args is an object passed from the server at runtime via
//  a script tag in the activities.html template.
const R = window["_args"],
      USER_ID = R["USER_ID"],
      CLIENT_ID = R["CLIENT_ID"],
      OFFLINE = R["OFFLINE"],
      ADMIN = R["ADMIN"],
      IMPERIAL = R["IMPERIAL"],
      DEVELOPMENT = R["DEVELOPMENT"];

const DIST_UNIT = IMPERIAL? 1609.34 : 1000.0,
      DIST_LABEL = IMPERIAL?  "mi" : "km",
      USER_BASE_URL = "/" + USER_ID,
      WEBSOCKET_URL = WS_SCHEME + window.location.host + "/data_socket",
      BEACON_HANDLER_URL = "/beacon_handler",
      STRAVA_BUTTON = img("/static/images/strava_button.png"),
      sendBeacon = navigator.sendBeacon || noop;

// Insert Google-Analytics object if this is a production environment
const ga = (OFFLINE || ADMIN || DEVELOPMENT)? noop : load_ga_object();

const console = window.console;

// Forgot what this does...
window.history.pushState(
  {}, "",
  window.location.origin + window.location.pathname
);

const DOM = s => document.querySelector(s),
      count_DOM_element = DOM("#count"),
      status_element = DOM("#status_msg"),
      progressBar = DOM("#progress-bar");


// Create a table element in the activities-list div
const table_el = document.createElement("table");
DOM("#activity-list").appendChild(table_el);


// Table headings, expressed as a list left-to-right
const headings = [
  '<i class="fa fa-link" aria-hidden="true"></i>',              // Strava url
  '<i class="fa fa-calendar" aria-hidden="true"></i>',          // date/time
  'Type',
  DIST_LABEL,
  '<i class="fa fa-clock-o" aria-hidden="true"></i>',
  'Name',
  'TTL <br> DD:HH:MM'
];

const config = {
  sortable: true,
  searchable: true,
  paging: false
};

// const dataTable = new DataTable(table_el, {
//   headings: headings
// })


// open websocket and make query
const sock = new WebSocket(WEBSOCKET_URL);
let wskey,
    count = 0,
    count_known;

const index = {};

sock.binaryType = 'arraybuffer';

status_element.innerText = "Retrieving Activity Index...";


/* Send the query as soon as the socket is open */
sock.onopen = function(event) {
    console.log("socket open: ", event);

    const queryObj = {client_id: CLIENT_ID};
    queryObj[USER_ID] = {
            streams: false,
            update_index_ts: false,
            limit: 1000000
    };

    let msg = JSON.stringify({query: queryObj});
    sock.send(msg);
};

sock.onclose = function(event) {
    console.log("socket closed: ", event);
    wskey = null;

    if (window["ga"]) {
      // Record this to google analytics
      ga('send', 'event', {
          eventCategory: USER_ID,
          eventAction: 'View-Index'
      });
    }
};

sock.onmessage = function(event) {
  const A = decode(new Uint8Array(event.data));

  if (!A) {
    sock.close();
    DOM("#status").style.display = "none";
    // makeTable();
    return;
  }

  if ("wskey" in A) {
    wskey = A["wskey"];
  }

  if ("count" in A) {
    progressBar["max"] = A["count"];
    count_known = true;
  }

  if (!A["_id"]) {
    return;
  }

  index[A._id] = A;

  count_DOM_element.innerText = `${++count}: ${A["name"]}`;

  if (count_known) {
    progressBar["value"] = count;
  }


  // let heatflask_link = `${USER_BASE_URL}?id=${A._id}`,
  //     strava_link = href(`${stravaActivityURL( A._id ) }`, STRAVA_BUTTON),
  //     tup = A["ts"],
  //     dt = new Date((tup[0] + tup[1]*3600) * 1000),
  //     date = dt.toLocaleString(),
  //     dkm = +(A.total_distance / DIST_UNIT).toFixed(2),
  //     row = "<tr>" +
  //        td(href(heatflask_link, A._id)) +
  //        td(strava_link) +
  //        td(date, sortable=tup[0]) +
  //        td(A.type) +
  //        td(dkm) +
  //        td(hhmmss(A.elapsed_time)) +
  //        td(A.name) +
  //        td(secs2DDHHMM(A.ttl)) +
  //        "</tr>";
  // table_body.append(row);
};


DOM('#rebuild-button').onclick = function () {
    if (OFFLINE) {
       window.alert("Sorry, I am offline");
       return;
    }

    if( window.confirm("Rebuild your Heatflask Index from Strava Data?") ) {
        window.location = window.location.href + "?rebuild=1";
    }
    return false;
};


// send beacons to the backend's beacon listener when this
// window gets closed or navigated away from,
// so that any ongoing backend operations can be aborted.
function tellBackendGoodBye() {
  sendBeacon(BEACON_HANDLER_URL, CLIENT_ID);

  if (wskey) {
    sendBeacon(BEACON_HANDLER_URL, wskey);
  }

  if (sock && sock.readyState == 1) {
    sock.send(JSON.stringify({close: 1}));
    sock.close();
  }
}

window.addEventListener('beforeunload', tellBackendGoodBye);
