/*
 * Data.js -- Here we define the functionality for getting the activity data
 *          that we use for vizualization.  That means, importing
 *          it from the backend or local storage.
 */


/* Rendering */
function updateLayers(msg) {
    if (Dom.prop("#autozoom", "checked")){
        let totalBounds = getBounds(appState.items.keys());

        if (totalBounds.isValid()){
            map.fitBounds(totalBounds);
        }
    }

    const num = appState.items.size;
    Dom.html(".data_message",` ${msg} ${num} activities rendered.`);

    // (re-)render the activities table
    // atable.clear();
    // atable.rows.add(Array.from(appState.items.values()));
    // atable.columns.adjust().draw()

    const table = makeTable(appState.items);

    if (!ADMIN && !OFFLINE) {
        // Record this to google analytics
        try{
            ga('send', 'event', {
                eventCategory: USER_ID,
                eventAction: 'Render',
                eventValue: num
            });
        }
        catch(err){}
    }

    dotLayer.reset();
    const ds = dotLayer.getDotSettings(),
          T = dotLayer.periodInSecs().toFixed(2);
    Dom.html("#period-value", T)
    Dom.trigger("#period-value", "change");

    appState.update()();
}


let sock;

window.addEventListener('beforeunload', function (event) {
    if (navigator.sendBeacon) {
        if (appState.wskey) {
            navigator.sendBeacon(BEACON_HANDLER_URL, appState.wskey);
        }
        navigator.sendBeacon(BEACON_HANDLER_URL, CLIENT_ID);
    }
    if (sock && sock.readyState == 1) {
        sock.send(JSON.stringify({close: 1}));
        sock.close()
    }
});

function renderLayers(query={}) {
    const date1 = Dom.get("#date1"),
          date2 = Dom.get("#date2"),
          type = Dom.get("#select_type"),
          num = Dom.get("#select_num"),
          idString = Dom.get("#activity_ids"),
          to_exclude = Array.from(appState.items.keys()).map(Number);

    // create a status box
    msgBox = Lcontrol.window(map, {
            position: 'top',
            content:"<div class='data_message'></div><div><progress class='progbar' id='box'></progress></div>",
            visible:true
    });

    Dom.html(".data_message", "Retrieving activity data...");


    let rendering = true,
        listening = true,
        numActivities = 0,
        count = 0;

    if (!sock || sock.readyState > 1) {
        sock = new PersistentWebSocket(WEBSOCKET_URL);
        sock.binaryType = 'arraybuffer';
    } else
        sendQuery();

    Dom.html(".data_message", "Retrieving activity data...");

    if (!appState.abortButtonListener)
        appState.abortButtonListener = Dom.addEvent('#abortButton', "click", function() {
            stopListening();
            doneRendering("<font color='red'>Aborted:</font>");
        });

    Dom.fadeIn('#abortButton');
    Dom.fadeIn(".progbar");

    Dom.prop('#renderButton', 'disabled', true);

    function doneRendering(msg) {

        if (!rendering)
            return;

        appState['after'] = Dom.get("#date1");
        appState["before"] = Dom.get("#date2");
        appState.update()();

        Dom.fadeOut("#abortButton");
        Dom.fadeOut(".progbar");

        if (msgBox) {
            msgBox.close();
            msgBox = undefined;
        }

        rendering = false;
        updateLayers(msg);

    }

    function stopListening() {
        if (!listening)
            return
        listening = false;
        sock.send(JSON.stringify({close: 1}));
        sock.close();
        if (navigator.sendBeacon && appState.wskey) {
            navigator.sendBeacon(BEACON_HANDLER_URL, appState.wskey);
        }
        appState.wskey = null;
        Dom.prop('#renderButton', 'disabled', false);

    }


    function sendQuery() {
        const queryObj = {
            client_id: CLIENT_ID
        };

        queryObj[USER_ID] = {
                limit: (type == "activities")? Math.max(1, +num) : undefined,
                after: date1? date1 : undefined,
                before: (date2 && date2 != "now")? date2 : undefined,
                activity_ids: idString?
                    Array.from(new Set(idString.split(/\D/).map(Number))) : undefined,
                exclude_ids: to_exclude.length?  to_exclude: undefined,
                streams: true
        };

        let msg = JSON.stringify({query: queryObj});
        sock.send(msg);
    }

    sock.onopen = function(event) {
        // console.log("socket open: ", event);
        if (rendering) sendQuery();
    }

    sock.onclose = function(event) {
        // console.log(`socket ${appState.wskey} closed:`, event);
    }

    // handle one incoming chunk from websocket stream
    sock.onmessage = function(event) {

        let A;

        try {
            A = msgpackDecode(new Uint8Array(event.data));
        }
        catch(e) {
            console.log(event);
            console.log(event.data);
            console.log(e);
            return;
        }

        if (!A) {
            Dom.prop('#renderButton', 'disabled', false);
            doneRendering("Finished.");
            return;
        } else

        if (!("_id" in A)) {

            if ("idx" in A)
                Dom.html(".data_message", `indexing...${A.idx}`);

            else if ("count" in A)
                numActivities += A.count;

            else if ("wskey" in A)
                appState.wskey = A.wskey;

            else if ("delete" in A && A.delete.length) {
                // delete all ids in A.delete
                for (let id of A.delete)
                    appState.items.delete(id);
                dotLayer.removeItems(A.delete);

            } else if ("done" in A) {
                console.log("received done");
                doneRendering("Done rendering.");
                return;

            } else if ("error" in A) {
                let msg = `<font color='red'>${A.error}</font><br>`;
                Dom.html(".data_message", msg);
                console.log(`Error: ${A.error}`);
                return;
            } else if ("msg" in A) {
                Dom.html(".data_message", A.msg);
            }

            return;
        }

        // only add A to appState.items if it isn't already there
        if ( !appState.items.has(A._id) ) {
            if (!A.type)
                return;

            // assign this activity a path color and speed type (pace, mph)
            Object.assign( A, strava.ATYPE.specs(A) );
            A.id = A._id;
            delete A._id;

            const tup = A.ts;
            delete A.ts;

            A.tsLoc = new Date((tup[0] + tup[1]*3600) * 1000);
            A.UTCtimestamp = tup[0];

            A.bounds = latLngBounds(A.bounds.SW, A.bounds.NE);

            dotLayer.addItem(A.id, A.polyline, A.pathColor, A.time, tup[0], A.bounds, A.n);
            appState.items.set(A.id, A);

            delete A.n;
            delete A.ttl;
            delete A.polyline;
            delete A.time;
        }

        count++;
        if (count % 5 === 0) {
            if (numActivities) {
                Dom.set(".progbar", count/numActivities);
                Dom.html(".data_message", `imported ${count}/${numActivities}`);
            } else {
                Dom.html(".data_message", `imported ${count}/?`);
            }
        }

    }
}
