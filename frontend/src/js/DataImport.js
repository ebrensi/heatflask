import app from "./Model.js"
import { L, controlWindow } from "./MapAPI.js"
import { dotLayer } from "./DotLayerAPI.js"
import queryBackend from "./Socket.js"
import { ATYPE } from "./strava.js"

let numActivities, count

/*
 * Set up a message box that appears only when app.flags.importing is true
 */
const importInfoBox = controlWindow({
  position: "center",
  title: '<i class="fas fa-download"></i> Importing...',
  content: `<div class="info-message"></div>
            <div class="progress msgbox">
            <progress class="progbar"></progress>
            </div>`,
  prompt: {},
  visible: false,
})

app.flags.onChange("importing", (val) => {
  val ? importInfoBox.show() : importInfoBox.hide()
})

const infoMsgElements = document.querySelectorAll(".info-message"),
  progBars = document.querySelectorAll(".progbar")

/*
 * Display a progress message and percent-completion
 */
function displayProgressInfo(msg, progress) {
  if (!msg && !progress) {
    infoMsgElements.forEach((el) => (el.innerHTML = ""))
    progBars.forEach((el) => el.removeAttribute("value"))
    return
  }

  if (msg) {
    for (const el of infoMsgElements) {
      el.innerHTML = msg
    }
  }

  if (progress) {
    for (const el of progBars) {
      el.value = progress
    }
  }
}

/*
 * Send a query to the backend and populate the items object with it.
 */
export function makeQuery(query, done) {
  app.flags.importing = true
  numActivities = 0
  count = 0

  displayProgressInfo("Retrieving activity data...")

  queryBackend(query, onMessage, done)
}

export function abortQuery() {
  app.flags.importing = false
  makeQuery()
}

// when done
// Dom.prop("#renderButton", "disabled", false);
// doneRendering("Finished.");
// return;

/*
 *  this is the callback for our data importer. If there is an open
 *    connection with the data-layer (backend server), it gets called on
 *    every received message.
 *
 * @param {Object} A - A JSON object ecoding 1 message from the data layer
 */
function onMessage(A) {
  if (!("_id" in A)) {
    if ("idx" in A) {
      displayProgressInfo(`indexing...${A.idx}`)
    } else if ("count" in A) {
      numActivities += A.count
    } else if ("delete" in A) {
      const toDelete = A.delete
      if (toDelete.length) {
        // delete all ids in A.delete
        const index = app.index
        for (const id of toDelete) {
          app.items[index[+id]] = null
        }
      }
    } else if ("done" in A) {
      console.log("received done")
      // doneRendering("Done rendering.");
    } else if ("msg" in A) {
      displayProgressInfo(A.msg)
    }

    return
  }

  if (!("type" in A)) {
    return
  }

  A.id = A._id
  delete A._id
  A.pathColor = ATYPE.pathColor(A.type)
  dotLayer.prepItem(A)

  app.items.set(A.id, A)

  // assign this activity a path color and speed type (pace, mph)
  // const atype = ATYPE.specs(A["type"]);
  // const tup = A["ts"];
  // const tsLocal = new Date((tup[0] + tup[1] * 3600) * 1000);
  // const UTCtimestamp = tup[0];
  // const bounds = L.latLngBounds(A["bounds"]["SW"], A["bounds"]["NE"]);

  // dotLayer.addItem(
  //   id,
  //   A["polyline"],
  //   atype.pathColor,
  //   A["time"],
  //   UTCtimestamp,
  //   bounds,
  //   A["n"]
  // );

  count++
  if (count % 5 === 0) {
    const prog = numActivities ? count / numActivities : null
    displayProgressInfo(`imported ${count}/${numActivities || "?"}`, prog)
  }
}
