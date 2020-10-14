import HyperList from "../../node_modules/hyperlist/lib/index.js"
import { HHMMSS } from "./appUtil.js"
import app from "./Model.js"
import { activityURL, appendCSS, ATYPE } from "./strava.js"
import { href } from "./appUtil.js"
import { EventHandler } from "./EventHandler.js"
import { sidebar } from "./MapAPI.js"

// This should vary based on the user's unit preferences
const DIST_LABEL = "mi",
  DIST_UNIT = 1609.34

patch()

sidebar.open("activities")

/*
 * Column headings
 */
const heading = [
  // "&#10003;",
  '<i class="icon-checkmark"></i>',
  '<i class="icon-calendar"></i>', // date/time
  '<i class="icon-activity"></i>', // type
  `<i class="icon-road"></i>(${DIST_LABEL})`, // distance
  '<i class="icon-hourglass-3"></i>', // duration
  '<i class="icon-pencil"></i>', // title
]

/*
 * Formatters for table columns.
 */
const atypeIcon = (atype) => ATYPE.specs(atype).name
const formatter = [
  A => A.selected? "&#10003;" : "",
  A => {
    const tsLocal = (A.ts[0] + A.ts[1] * 3600) * 1000,
    tsString = new Date(tsLocal).toLocaleString()
    return href(activityURL(A.id), tsString)
  },
  A => `<span class="${A.type}">${atypeIcon(A.type)}</span>`,
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
  () => null
]

/* By default, sort the date column descending, vs "asc" */
const defaultSort = {column: 1, direction: "desc"}
let currentSort

const numColumns = heading.length

export function sortItems({column, direction}) {
  const value = sortValue[column]
  const compareFunc = (direction === "asc")?
    (item1, item2) => value(item1) - value(item2) :
    (item1, item2) => value(item2) - value(item1)

  app.items.sort(compareFunc)
  currentSort = {column, direction}
  delete app._index

}


function makeRow(idx) {
  const A = app.items[idx]
  const tr = document.createElement("tr")

  if (A.selected) {
    tr.classList.add("selected")
  }

  tr.idx = idx

  for (let j=0; j<numColumns; j++) {
    const td = document.createElement("td")
    td.innerHTML = formatter[j](A)
    tr.appendChild(td)
  }

  return tr
}

const rows = new Proxy({}, {
  get: function(target, prop) {
    return makeRow(prop)
  }
});

app.rows = rows


/*
 *  Create the table/hyperlist
 */
const tableElement = document.getElementById("items")

// Make header row
const tHead = tableElement.createTHead()

const headerRow = tHead.insertRow()
for (const label of heading) {
  const th = document.createElement("th")
  th.innerHTML = label
  headerRow.appendChild(th)
}


const config = {
  itemHeight: 0,
  get total() { return app.items.length},
  generate: makeRow
}

let list

// Add Strava activity type stylings
appendCSS(tableElement)

export function update() {
  sortItems(currentSort || defaultSort)
  lastSelection = {}

  const tbOld = document.querySelector("tbody")
  if (tbOld) tbOld.remove()
  const tBody = document.createElement("tbody")
  tableElement.appendChild(tBody)

  list = list || new HyperList(tBody, config)
  list.refresh(tBody, config)
}

window.onresize = update


let lastSelection = {}

tableElement.addEventListener("click", function (e) {
  const td = e.target,
    tr = td.parentElement,
    idx = tr.idx,
    A = app.items[idx];

  // toggle selection property of the item represented by clicked row
  A.selected = !A.selected

  /* handle shift-click for multiple (de)selection
   *  all rows beteween the clicked row and the last clicked row
   *  will be set to whatever this row was set to.
   */
  if (e.shiftKey && lastSelection) {
    const first = Math.min(idx, lastSelection.idx),
      last = Math.max(idx, lastSelection.idx)

    // console.log(`${selected? "select":"deselect"} ${first} to ${last}`)
    let i
    for (i = first + 1; i <= last; i++) {
      app.items[i].selected = A.selected
    }

    lastSelection.idx = i
  }
  else {
    lastSelection.idx = idx
  }

  lastSelection.val = A.selected

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

function patch() {
    HyperList.prototype._getRow = function (i) {
      const config = this._config
      let item = config.generate(i)
      let height = item.height

      if (height !== undefined && isNumber(height)) {
        item = item.element

        // The height isn't the same as predicted, compute positions again
        if (height !== this._itemHeights[i]) {
          this._itemHeights[i] = height
          this._computePositions(i)
          this._scrollHeight = this._computeScrollHeight(i)
        }
      } else {
        height = this._itemHeights[i]
      }

      if (!item || item.nodeType !== 1) {
        throw new Error(`Generator did not return a DOM Node for index: ${i}`)
      }

      item.classList.add(config.rowClassName || 'vrow')

      const top = this._itemPositions[i] + this._scrollPaddingTop

      HyperList.mergeStyle(item, {
        [config.horizontal ? 'left' : 'top']: `${top}px`
      })

      return item
    }
}
