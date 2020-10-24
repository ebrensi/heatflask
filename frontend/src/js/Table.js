import { HHMMSS } from "./appUtil.js"
import app from "./Model.js"
import { activityURL, appendCSS, ATYPE } from "./strava.js"
import { href } from "./appUtil.js"
import { EventHandler } from "./EventHandler.js"
import { sidebar } from "./MapAPI.js"

// This should vary based on the user's unit preferences
const DIST_LABEL = "mi",
  DIST_UNIT = 1609.34

// open up the sidebar to the table view (development)
// sidebar.open("activities")

/*
 * Column headings
 */
// the icon associated with an activity type
const atypeIcon = (atype) => ATYPE.specs(atype).name
const heading = [
  '<i class="fas fa-check-double"></i>',
  '<i class="fas fa-calendar-alt"></i>', // date/time
  atypeIcon("activity"), // type
  `<i class="fas fa-ruler"></i>(${DIST_LABEL})`, // distance
  '<i class="fas fa-hourglass-end"></i>', // duration
  '<i class="fas fa-file-signature"></i>', // title
]

/*
 * Formatters for table columns.
 */
const formatter = [
  (A) => (A.selected ? "&#10003;" : ""),
  (A) => {
    const tsString = A.tsLocal.toLocaleString()
    return href(activityURL(A.id), tsString.split(",")[0])
  },
  (A) => atypeIcon(A.type),
  (A) => (A.total_distance / DIST_UNIT).toFixed(2),
  (A) => HHMMSS(A.elapsed_time),
  (A) => A.name,
]

/*
 * Numerical value to sort for each column
 */
const atypeIndex = ATYPE.index // the integer index of each activity-type
const sortValue = [
  (A) => (A.selected ? 1 : 0),
  (A) => A.ts,
  (A) => atypeIndex[A.type],
  (A) => A.total_distance,
  (A) => A.elapsed_time,
  null,
]

/* By default, sort the date column descending, */
const defaultSort = { column: 1, asc: false }
let currentSort

const numColumns = heading.length

export function sort({ column, asc }) {
  const value = sortValue[column]
  if (!value) return

  const compareFunc = asc
    ? (tr1, tr2) => value(tr1.item) - value(tr2.item)
    : (tr1, tr2) => value(tr2.item) - value(tr1.item)

  const trs = new Array(app.items.size)
  let i = 0
  for (const A of app.items.values()) {
    trs[i++] = A.tr
  }

  trs.sort(compareFunc)

  const newBody = document.createElement("tbody")
  for (const tr of trs) {
    newBody.appendChild(tr)
  }

  const currentBody = tableElement.tBodies[0]
  if (currentBody) tableElement.replaceChild(newBody, currentBody)
  else tableElement.appendChild(newBody)

  // set the sort attribute for this column's header element
  headerRow.cells[column].setAttribute("data-sort", asc ? "asc" : "desc")

  currentSort = { column, asc }
}

function makeRow(A) {
  const tr = document.createElement("tr")

  tr.item = A

  for (let j = 0; j < numColumns; j++) {
    const td = document.createElement("td")
    td.innerHTML = formatter[j](A)
    tr.appendChild(td)
  }

  return tr
}

/*
 *  Create the table
 */
const tableElement = document.getElementById("items")
tableElement.classList.add("heatflask-table")

// Make header row
const tHead = tableElement.createTHead()

const headerRow = tHead.insertRow()
for (const label of heading) {
  const th = document.createElement("th")
  th.innerHTML = label
  headerRow.appendChild(th)
}

// Add sort events to header row
headerRow.addEventListener("click", (e) => {
  // the target may be html that is part of the header name
  const column = e.target.closest("th").cellIndex

  const sortSpec = { ...currentSort }
  headerRow.cells[currentSort.column].removeAttribute("data-sort")

  if (sortSpec.column === column) {
    // if the table is alredy sorted by the selected column,
    // we just change the sort direction
    sortSpec.asc = !sortSpec.asc
  } else {
    sortSpec.column = column
  }
  sort(sortSpec)
})

/**
 * Update the table (after adding or removing rows)
 */
export function update(remake) {
  for (const A of app.items.values()) {
    if (!A.tr || remake) {
      A.tr = makeRow(A)
      // A.tr.setAttribute("data-pathColor", A.pathColor)
    }

    // dot-colors get set by DotLayer.reset(), so make sure this is called after that
    // A.tr.setAttribute("data-dotColor", A.dotColor)
  }
  sort(currentSort || defaultSort)
  lastSelection = {}
}

/*
 * Table Selections
 */
let lastSelection = {}

function select(A, selected) {
  if (selected && !A.selected) {
    A.selected = selected
    A.tr.classList.add("selected")
    A.tr.cells[0].innerHTML = "&check;"
  } else if (!selected && A.selected) {
    A.selected = selected
    A.tr.classList.remove("selected")
    A.tr.cells[0].innerHTML = ""
  }
}

export function clearSelections() {
  for (const A of app.items.values()) {
    if (A.selected) select(A, false)
  }
}

tableElement.addEventListener("click", function (e) {
  const td = e.target
  if (td.tagName !== "TD") return

  const tr = td.parentElement,
    A = tr.item,
    idx = tr.rowIndex - 1,
    selected = !A.selected

  // toggle selection property of the item represented by clicked row
  select(A, selected)

  /* handle shift-click for multiple (de)selection
   *  all rows beteween the clicked row and the last clicked row
   *  will be set to whatever this row was set to.
   */
  if (e.shiftKey && lastSelection) {
    const first = Math.min(idx, lastSelection.idx),
      last = Math.max(idx, lastSelection.idx)

    // console.log(`${selected? "select":"deselect"} ${first} to ${last}`)
    const rows = tableElement.tBodies[0].rows
    let i
    for (i = first + 1; i <= last; i++) {
      select(rows[i].item, selected)
    }

    lastSelection.idx = i - 1
  } else {
    lastSelection.idx = idx
  }

  lastSelection.val = selected

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
