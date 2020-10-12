import HyperList from "../../node_modules/hyperlist/lib/index.js"
import { HHMMSS } from "./appUtil.js"
import { items } from "./Model.js"
import { activityURL, appendCSS } from "./strava.js"
import { href } from "./appUtil.js"
import { EventHandler } from "./EventHandler.js"
import { sidebar } from "./MapAPI.js"

// This should vary based on the user's unit preferences
const DIST_LABEL = "mi",
  DIST_UNIT = 1609.34

sidebar.open("activities")

/*
 * Column headings
 */
const heading = [
  "&#10003;",
  '<i class="far fa-calendar-alt"></i>', // date/time
  '<i class="fas fa-running"></i>/<i class="fas fa-biking"></i>', // type
  `<i class="fas fa-road"></i>(${DIST_LABEL})`, // distance
  '<i class="fas fa-hourglass-end"></i>', // duration
  '<i class="fas fa-file-signature"></i>', // title
]

/*
 * Formatters for table columns.
 */
const formatter = [
  A => A.selected? "&#10003;" : "",
  A => {
    const tsLocal = (A.ts[0] + A.ts[1] * 3600) * 1000,
    tsString = new Date(tsLocal).toLocaleString()
    return href(activityURL(id), tsString)
  },
  A => `<span class="${A.type}">${A.type}</span>`,
  A => (A.total_distance / DIST_UNIT).toFixed(2),
  A => HHMMSS(A.elapsed_time),
  A => A.name
]

/*
 * Numerical value to sort for each column
 */
const sortValue = [
  A => A.selected? 1 : 0,
  A => A.ts[0],
  A => A.type,
  A => A.total_distance,
  A => A.elapsed_time,
  A => null
]

/* By default, sort the date column descending, vs "asc" */
const defaultSort = {column: 1, direction: "desc"}
const numColumns = heading.length

function sortItems2({column, direction}) {
  const value = sortValue[column]
  const compareFunc = (direction === "asc")?
    (item1, item2) => value(item1) - value(item2) :
    (item1, item2) => value(item2) - value(item1)

  itemsArray.sort(compareFunc)
}


function makeRow(idx) {
  const A = itemsArray[idx]
  const tr = document.createElement("tr")

  if (A.selected) {
    tr.classList.add("selected")
  }

  for (let j=0; j<numColumns; j++) {
    const td = document.createElement("td", {
      html: formatter[j](A)
    })
  }

  return tr
}

/*
 *  Create the table/hyperlist
 */
const tableElement = document.getElementById("activitiesList")

// Make header row
const tHead = tableElement.createTHead()
const headerRow = tHead.insertRow()
for (const label of heading) {
  const th = document.createElement("th", {
    html: label
  })
  headerRow.appendChild(th)
}

const tBody = document.createElement("tbody")
table.appendChild(tBody)

const config = {
  itemHeight: 40,
  get total() { return itemsArray.length},
  generate: makeRow
}

const list = new HyperList(tBody, config)

// Add Strava activity type stylings
appendCSS(tBody)

function update() {
  list.refresh(tBody, config)
}

window.onresize = update


/*
 * Row selection management
 */
/**
 * Specifiy the ids of multiple items to select or dselect
 * @param  {Object} selections -- key, value pairs {(id|idx)} : boolean}
            indicates whether that id or index was (de)selected
 */

function setSelect(A, selected) {
  if (selected) {
    A.selected = true
  else {
    A.selected = false
  }
}

export function updateSelections(selections) {
  console.log(selections)
  for (const idx in selections) {
    setSelect(itemsArray[idx], selections[idx])
  }

  for (const id in selections) {
    const selected = selections[id]
    const A = itemsArray.find(A => A.id === id)
    setSelect(A, selected)
  }
}


const lastSelection = {}

tbody.addEventListener("click", function (e) {
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

  lastSelection.val = selected
  lastSelection.idx = idx

  select(currentSelections)
  events.emit("selection", currentSelections)
  update()

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
