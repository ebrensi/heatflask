// import { DataTable } from "../../node_modules/simple-datatables/src/index.js";
import { DataTable } from "../ext/Simple-DataTables/src/index.js" // testing some development-mods (functionality should be the same)
import "../../node_modules/simple-datatables/src/style.css"
import { HHMMSS } from "./appUtil.js"
import { items } from "./Model.js"
import { activityURL, appendCSS } from "./strava.js"
import { href } from "./appUtil.js"
import { EventHandler } from "./EventHandler.js"
import { sidebar } from "./MapAPI.js"

/*
 * Formatters for table columns.
 */
function formatSelect(id, cell, row) {
  row.id = id
  return ""
}

function formatTimestamp(id, cell) {
  const A = items[id],
    tsLocal = (A.ts[0] + A.ts[1] * 3600) * 1000,
    tsString = new Date(tsLocal).toLocaleString()

  cell.dataset.content = +tsLocal
  return href(activityURL(id), tsString)
}

function formatAtype(id, cell) {
  const A = items[id]
  cell.dataset.content = A.type
  return `<span class="${A.type}">${A.type}</span>`
}

function formatDistance(id, cell) {
  const A = items[id]
  cell.dataset.content = A.total_distance

  return (A.total_distance / DIST_UNIT).toFixed(2)
}

function formatDuration(id, cell) {
  const A = items[id]
  cell.dataset.content = A.elapsed_time
  return HHMMSS(A.elapsed_time)
}

function formatTitle(id) {
  const A = items[id]
  return A.name
}

/*
 * We add and remove rows from the table with these functions.
 *   addItem and removeItem prepare a bulk action that is executed
 *   when update() is called.
 */

/**
 * Add an item to the table (deferred until update is called)
 * @param {number|String} id --
 */
export function addItem(id) {
  toAdd.add(id)
}

export function removeItem(id) {
  toRemove.add(id)
}

export function update() {
  if (toRemove.size) {
    const indexGen = function* () {
      for (const id of toRemove.values()) {
        yield indexLookup.get(id)
      }
    }
    rows.remove(indexGen())
  }

  if (toAdd.size) {
    rows.add(rowIterator(toAdd))
  }

  toAdd.clear()
  toRemove.clear()
  indexLookup.clear()

  for (const tr of dataTable.data) {
    indexLookup.set(+tr.id, tr.dataIndex)
  }
}

function* rowIterator(ids) {
  for (const id of ids) {
    yield Array(6).fill(id)
  }
}

/*
 * Row selection management
 */
/**
 * Specifiy the ids of multiple items to select or dselect
 * @param  {Object} selections -- key, value pairs {id : boolean} indicates whether id is (de)selected
 */
export function select(selections) {
  console.log(selections)
  for (const [id, selected] of Object.entries(selections)) {
    const idx = indexLookup.get(+id),
      dRow = dataTable.data[idx]

    if (selected) {
      dRow.classList.add("selected")
      selectedItems.add(+id)
    } else {
      dRow.classList.remove("selected")
      selectedItems.delete(+id)
    }
  }
  dataTable.update()
}

export const selectedItems = new Set()

/*
 *  Create the dataTable and set up event listeners
 */

const tableElement = document.getElementById("activitiesList")
appendCSS(tableElement)

const DIST_LABEL = "mi",
  DIST_UNIT = 1609.34

const toAdd = new Set(),
  toRemove = new Set(),
  indexLookup = new Map()

sidebar.open("activities")

export const dataTable = new DataTable(tableElement, {
  sortable: true,
  searchable: true,
  paging: true,
  perPageSelect: false,
  header: true,
  footer: false,
  // scrollY: "60vh",
  data: {
    headings: [
      "sel",
      '<i class="far fa-calendar-alt"></i>Date', // date/time
      '<i class="fas fa-running"></i>/<i class="fas fa-biking"></i>Type', // type
      `<i class="fas fa-road"></i>Dist (${DIST_LABEL})`, // distance
      '<i class="fas fa-hourglass-end"></i>Time', // duration
      '<i class="fas fa-file-signature"></i>Title', // title
    ],
  },
  columns: [
    { select: 0, render: formatSelect },
    { select: 1, type: "string", render: formatTimestamp, sort: "desc" },
    { select: 2, type: "string", render: formatAtype },
    { select: 3, type: "number", render: formatDistance },
    { select: 4, type: "number", render: formatDuration },
    { select: 5, type: "string", render: formatTitle, sortable: false },
  ],
})

const rows = dataTable.rows()
const lastSelection = {}

dataTable.table.addEventListener("click", function (e) {
  const td = e.target,
    tr = td.parentElement,
    id = +tr.id,
    idx = tr.rowIndex - 1,
    currentSelections = {}

  // toggle selection property of the clicked row
  const selected = !selectedItems.has(id)

  currentSelections[id] = selected

  /* handle shift-click for multiple (de)selection
   *  all rows beteween the clicked row and the last clicked row
   *  will be set to whatever this row was set to.
   */
  if (e.shiftKey && lastSelection) {
    const first = Math.min(idx, lastSelection.idx),
      last = Math.max(idx, lastSelection.idx),
      pageRows = dataTable.body.rows

    // console.log(`${selected? "select":"deselect"} ${first} to ${last}`)
    for (let i = first + 1; i <= last; i++) {
      const dRow = pageRows[i],
        did = +dRow.id

      currentSelections[did] = selected
    }
  }

  // let dotLayer know about selection changes
  // dotLayer.setItemSelect(selections);

  lastSelection.val = selected
  lastSelection.idx = idx

  select(currentSelections)
  events.emit("selection", currentSelections)

  // let redraw = false;
  // const mapBounds = map.getBounds();

  // if (Dom.prop("#zoom-to-selection", "checked")) zoomToSelectedPaths();
})

/*
 * We will generate our own events
 */
export const events = new EventHandler()

/*
function handle_table_selections(e, dt, type, indexes) {
  // let redraw = false;
  // const mapBounds = map.getBounds(),
  //       selections = {};
  // if ( type === 'row' ) {
  //     const rows = atable.rows( indexes ).data();
  //      for ( const A of Object.values(rows) ) {
  //         if (!A.id)
  //             break;
  //         A.selected = !A.selected;
  //         selections[A.id] = A.selected;
  //         if (!redraw)
  //             redraw |= mapBounds.overlaps(A.bounds);
  //     }
  // }
  // if ( Dom.prop("#zoom-to-selection", 'checked') )
  //     zoomToSelectedPaths();
  // dotLayer.setItemSelect(selections);
}


  function selectedIDs(){
    return Array.from(appState.items.values())
                .filter(A => A.selected)
                .map(A => A.id );
  }

  function zoomToSelectedPaths(){
    // Pan-Zoom to fit all selected activities
    let selection_bounds = latLngBounds();
    appState.items.forEach((A, id) => {
        if (A.selected) {
            selection_bounds.extend(A.bounds);
        }
    });
    if (selection_bounds.isValid()) {
        map.fitBounds(selection_bounds);
    }
  }

  function openSelected(){
    let ids = selectedIDs();
    if (ids.length > 0) {
        let url = BASE_USER_URL + "?id=" + ids.join("+");
        if (appState.paused == true){
            url += "&paused=1"
        }
        window.open(url,'_blank');
    }
  }

  function deselectAll(){
    handle_path_selections(selectedIDs());
  }


function activityDataPopup(id, latlng){
    let A = appState.items.get(id),
        d = A.total_distance,
        elapsed = util.hhmmss(A.elapsed_time),
        v = A.average_speed,
        dkm = +(d / 1000).toFixed(2),
        dmi = +(d / 1609.34).toFixed(2),
        vkm,
        vmi;

    if (A.vtype == "pace"){
        vkm = util.hhmmss(1000 / v).slice(3) + "/km";
        vmi = util.hhmmss(1609.34 / v).slice(3) + "/mi";
    } else {
        vkm = (v * 3600 / 1000).toFixed(2) + "km/hr";
        vmi = (v * 3600 / 1609.34).toFixed(2) + "mi/hr";
    }

    const popupContent = `
        <b>${A.name}</b><br>
        ${A.type}:&nbsp;${A.tsLoc}<br>
        ${dkm}&nbsp;km&nbsp;(${dmi}&nbsp;mi)&nbsp;in&nbsp;${elapsed}<br>
        ${vkm}&nbsp;(${vmi})<br>
        View&nbsp;in&nbsp;
        <a href='https://www.strava.com/activities/${A.id}' target='_blank'>Strava</a>
        ,&nbsp;
        <a href='${BASE_USER_URL}?id=${A.id}'&nbsp;target='_blank'>Heatflask</a>
    `;

    const popup = L.popup().setLatLng(latlng).setContent(popupContent).openOn(map);
}



*/
