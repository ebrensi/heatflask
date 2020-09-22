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
import "../css/activity-index.css";

import * as strava from "./strava.js";
import { WS_SCHEME, DDHHMM, HHMMSS, href, noop } from "./appUtil.js";
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

const DIST_UNIT = IMPERIAL ? 1609.34 : 1000.0,
  DIST_LABEL = IMPERIAL ? "mi" : "km",
  WEBSOCKET_URL = WS_SCHEME + window.location.host + "/data_socket",
  BEACON_HANDLER_URL = "/beacon_handler",
  sendBeacon = navigator.sendBeacon || noop;

// Insert Google-Analytics object if this is a production environment
const ga = OFFLINE || ADMIN || DEVELOPMENT ? noop : load_ga_object();

const console = window.console;

// Forgot what this does...
window.history.pushState(
  {},
  "",
  window.location.origin + window.location.pathname
);

const DOM = (s) => document.querySelector(s),
  count_DOM_element = DOM("#count"),
  status_element = DOM("#status_msg"),
  progressBar = DOM("#progress-bar");

// open websocket and make query
const sock = new WebSocket(WEBSOCKET_URL);
let wskey,
  count = 0,
  count_known;

const index = new Map(),
  selected = new Set();

let keys, lastSelection, dataTable;

sock.binaryType = "arraybuffer";

status_element.innerText = "Retrieving Activity Index...";

/* Send the query as soon as the socket is open */
sock.onopen = function (event) {
  console.log("socket open: ", event);

  const queryObj = { client_id: CLIENT_ID };
  queryObj[USER_ID] = {
    streams: false,
    update_index_ts: false,
    limit: 1000000,
  };

  let msg = JSON.stringify({ query: queryObj });
  sock.send(msg);
};

/* For every message we get from the backend */
sock.onmessage = function (event) {
  const A = decode(new Uint8Array(event.data));

  if (!A) {
    sock.close();
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

  const id = A["_id"];

  const strava_link = href(`${strava.activityURL(id)}`, id),
    tup = A["ts"],
    dt = new Date((tup[0] + tup[1] * 3600) * 1000),
    date = dt.toLocaleString(),
    dist = +(A["total_distance"] / DIST_UNIT).toFixed(2);

  index.set(id, [
    strava_link,
    date,
    `<span class="${A["type"].toLowerCase()}">${A["type"]}</span>`,
    dist,
    HHMMSS(A["elapsed_time"]),
    A["name"],
    DDHHMM(A["ttl"]),
  ]);

  count_DOM_element.innerText = `${++count}: ${A["name"]}`;

  if (count_known) {
    progressBar["value"] = count;
  }
};

/* When data import is done, we call makeTable */
sock.onclose = function (event) {
  console.log("socket closed: ", event);
  wskey = null;

  if (window["ga"]) {
    // Record this to google analytics
    ga("send", "event", {
      eventCategory: USER_ID,
      eventAction: "View-Index",
    });
  }

  keys = Array.from(index.keys());

  progressBar.removeAttribute("max");
  status_element.innerText = "Building DataTable...";
  count_DOM_element.innerText = "";

  /* We need a slight delay here for the above messages to display
        since makeTable() is blocking */
  setTimeout(() => {
    window["dataTable"] = dataTable = makeTable();
    DOM("#status").style.display = "none";
  }, 50);
};

function makeTable() {
  /* Make the datatable */
  // Create a table element in the activities-list div
  const table_el = document.createElement("table");
  DOM("#activity-list").appendChild(table_el);

  /* Table headings, expressed as a list left-to-right */
  const headings = [
    '<i class="fa fa-link" aria-hidden="true"></i>', // Strava url
    '<i class="fa fa-calendar" aria-hidden="true"></i>', // timestamp
    "Type",
    DIST_LABEL,
    '<i class="fa fa-clock-o" aria-hidden="true"></i>',
    "Name",
    "TTL (DD:HH:MM)",
  ];

  /* Instantiate the Datatable */
  console.time("table build");
  const dt = new DataTable(table_el, {
    sortable: true,
    searchable: true,
    paging: true,
    perPage: 25,
    layout: {
      top: "{search}",
      bottom: "{info}{pager}",
    },
    header: true,
    footer: false,
    scrollY: "60vh",
    data: {
      headings: headings,
      data: Array.from(index.values()),
    },
  });

  console.timeEnd("table build");

  const tbody = dt.table.tBodies[0];

  /* add a listener for selections */
  tbody.addEventListener("click", selectionHandler);

  /* add a clear selection button */
  const div = document.createElement("div");
  div.classList.add("dataTable-clear-selections");
  document.querySelector(".dataTable-top").prepend(div);

  const btn = document.createElement("button");
  btn.id = "clear-selection-button";
  btn.classList.add("btn", "btn-a", "btn-sm", "hidden");
  div.appendChild(btn);

  btn.onclick = clearSelections;

  strava.appendCSS(dt.table);

  return dt;
}

/*
  When the user clicks or taps on a table cell we run this function.
  This should be intuitive and work for both mouse/dektop
  and touch screens
*/
function selectionHandler(e) {
  const td = e.target,
    tr = td.parentElement,
    idx = tr.dataIndex,
    id = keys[idx];

  if (!idx) {
    return;
  }

  // toggle selection property of the clicked row
  tr.classList.toggle("selected");
  if (selected.has(id)) {
    selected.delete(id);
  } else {
    selected.add(id);
  }

  // handle shift-click for multiple (de)selection
  //  all rows beteween the clicked row and the last clicked row
  //  will be set to whatever this row was set to.
  if (e.shiftKey && lastSelection) {
    const prev = lastSelection,
      first = Math.min(dataIndex, prev.dataIndex),
      last = Math.max(dataIndex, prev.dataIndex);

    debugger;
    for (let i = first + 1; i <= last; i++) {
      const tr = table.data[i],
        classes = tr.classList,
        id = ids[tr.dataIndex],
        A = appState.items.get(id);

      A.selected = selected;
      selections[id] = selected;

      if (selected && !classes.contains("selected")) {
        classes.add("selected");
        debugger;
      } else if (!selected && classes.contains("selected")) {
        classes.remove("selected");
      }
    }
  }

  const numSelected = selected.size,
    btn = DOM("#clear-selection-button");

  if (numSelected > 0) {
    btn.innerText = `Clear ${numSelected} selected entries`;
    btn.classList.replace("hidden", "visible");
  } else {
    btn.classList.replace("visible", "hidden");
  }
  console.log(selected);
}

/* set up some DOM events */

/* Reload the page with fresh data the backend imports from strava */
DOM("#rebuild-button").onclick = function () {
  if (OFFLINE) {
    window.alert("Sorry, you are offline");
    return;
  }

  if (window.confirm("Rebuild your Heatflask Index from Strava Data?")) {
    window.location = window.location.href + "?rebuild=1";
  }
  return false;
};

/* a function to remove the selected class from all table rows */
function clearSelections() {
  for (const id of selected) {
    const idx = keys.indexOf(id);
    dataTable.activeRows[idx].classList.remove("selected");
  }
  selected.clear();

  DOM("#clear-selection-button").classList.replace("visible", "hidden");
}

/* add some keybindings for the table */
document.addEventListener("keydown", function (e) {
  if (e.target !== document.body) {
    return;
  }

  const keyCode = e.keyCode;

  if (keyCode === 37 && !dataTable.onFirstPage) {
    // left arrow
    dataTable.page(dataTable.currentPage - 1);
  } else if (keyCode == 39 && !dataTable.onLastPage) {
    // right arrow
    dataTable.page(dataTable.currentPage + 1);
  }
});

/*
  send beacons to the backend's beacon listener when this
 window gets closed or navigated away from,
 so that any ongoing backend operations can be aborted.
*/
function tellBackendGoodBye() {
  sendBeacon(BEACON_HANDLER_URL, CLIENT_ID);

  if (wskey) {
    sendBeacon(BEACON_HANDLER_URL, wskey);
  }

  if (sock && sock.readyState == 1) {
    sock.send(JSON.stringify({ close: 1 }));
    sock.close();
  }
}
window.addEventListener("beforeunload", tellBackendGoodBye);

// // let dotLayer know about selection changes
// dotLayer.setItemSelect(selections);

// appState.lastSelection = {
//     val: selected,
//     dataIndex: dataIndex
// }

// let redraw = false;
// const mapBounds = map.getBounds();

// if ( Dom.prop("#zoom-to-selection", 'checked') )
//     zoomToSelectedPaths();
