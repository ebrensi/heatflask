import { DataTable } from "simple-datatables";
import "../../node_modules/simple-datatables/src/style.css";

// Initialize Activity Table in sidebar
// let tableColumns = [
//         {
//             title: '<i class="fa fa-calendar" aria-hidden="true"></i>',
//             data: null,
//             render: (data, type, row) => {
//                 if ( type === 'display' || type === 'filter' ) {
//                     // const dstr = row.tsLoc.toISOString().split('T')[0];
//                     return util.href( strava.activityURL(row.id), row.tsLoc.toLocaleString());
//                 } else
//                     return row.UTCtimestamp;
//             }
//         },

//         {
//             title: "Type",
//             data: null,
//             render: (A) => `<p style="color:${A.pathColor}">${A.type}</p>`
//         },

//         {
//             title: `<i class="fa fa-arrows-h" aria-hidden="true"></i> (${DIST_LABEL})`,
//             data: "total_distance",
//             render: (A) => +(A / DIST_UNIT).toFixed(2)},
//         {
//             title: '<i class="fa fa-clock-o" aria-hidden="true"></i>',
//             data: "elapsed_time",
//             render: util.hhmmss
//         },

//         {
//             title: "Name",
//             data: null,
//             render: (A) => `<p style="background-color:${A.dotColor}"> ${A.name}</p>`
//         },

//     ],

//     imgColumn = {
//         title: "<i class='fa fa-user' aria-hidden='true'></i>",
//         data: "owner",
//         render: util.formatUserId
//     };

// const atable = $('#activitiesList').DataTable({
//                 paging: false,
//                 deferRender: true,
//                 scrollY: "60vh",
//                 // scrollX: true,
//                 scrollCollapse: true,
//                 // scroller: true,
//                 order: [[ 0, "desc" ]],
//                 select: util.isMobileDevice()? "multi" : "os",
//                 data: appState.items.values(),
//                 rowId: "id",
//                 columns: tableColumns
//             }).on( 'select', handle_table_selections)
//               .on( 'deselect', handle_table_selections);

// const tableScroller = $('.dataTables_scrollBody');

let tableColumns = [
        {
            title: '<i class="fa fa-calendar" aria-hidden="true"></i>',
            data: null,
            render: (data, type, row) => {
                if ( type === 'display' || type === 'filter' ) {
                    // const dstr = row.tsLoc.toISOString().split('T')[0];
                    return util.href( strava.activityURL(row.id), row.tsLoc.toLocaleString());
                } else
                    return row.UTCtimestamp;
            }
        },

        {
            title: "Type",
            data: null,
            render: (A) => `<p style="color:${A.pathColor}">${A.type}</p>`
        },

        {
            title: `<i class="fa fa-arrows-h" aria-hidden="true"></i> (${DIST_LABEL})`,
            data: "total_distance",
            render: (A) => +(A / DIST_UNIT).toFixed(2)},
        {
            title: '<i class="fa fa-clock-o" aria-hidden="true"></i>',
            data: "elapsed_time",
            render: util.hhmmss
        },

        {
            title: "Name",
            data: null,
            render: (A) => `<p style="background-color:${A.dotColor}"> ${A.name}</p>`
        },

    ],

    imgColumn = {
        title: "<i class='fa fa-user' aria-hidden='true'></i>",
        data: "owner",
        render: util.formatUserId
    };


export function makeTable(items) {
    const colData = [];

    for (const id of appState.items.keys()) {
        colData.push([id, id, id, id, id]) ;
    }

    const data = {
      headings: [
        '<i class="fa fa-calendar" aria-hidden="true"></i>',
        "Type",
        `<i class="fa fa-arrows-h" aria-hidden="true"></i> (${DIST_LABEL})`,
        '<i class="fa fa-clock-o" aria-hidden="true"></i>',
        "Name"
      ],
      data: colData
    };

    const config = {
      data,
      columns: [
        { select: 0, type: "string", sort: "desc", render: id => items.get(+id).tsLoc.toLocaleString() },
        { select: 1, type: "string", render: (id, cell, row) => {
            const A = items.get(+id);
            return `<p style="color:${A.pathColor}">${A.type}</p>`;
        }},
        { select: 2, type: "number", render: id => items.get(+id).total_distance },
        { select: 3, type: "number", render: id => util.hhmmss(items.get(+id).elapsed_time) },
        { select: 4, type: "string", render: id => items.get(+id).name },
      ],
      sortable: true,
      searchable: true,
      paging: false,
      scrollY: "60vh"
    };

    const table = new DataTable("#activitiesList", config);

    table.table.addEventListener("click", function(e) {
        const td = e.target,
              colNum = td.cellIndex,
              id = +td.data,
              tr = td.parentElement,
              dataIndex = tr.dataIndex,
              selections = {},
              ids = Array.from(appState.items.keys());

        // toggle selection property of the clicked row
        const A = appState.items.get(id);
        tr.classList.toggle("selected");
        A.selected = !A.selected;
        const selected = selections[id] = A.selected;

        // handle shift-click for multiple (de)selection
        //  all rows beteween the clicked row and the last clicked row
        //  will be set to whatever this row was set to.
        if (e.shiftKey && appState.lastSelection) {

            const prev = appState.lastSelection,
                  first = Math.min(dataIndex, prev.dataIndex),
                  last = Math.max(dataIndex, prev.dataIndex);

            debugger;
            for (let i=first+1; i<=last; i++) {
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

        // let dotLayer know about selection changes
        dotLayer.setItemSelect(selections);

        appState.lastSelection = {
            val: selected,
            dataIndex: dataIndex
        }

        let redraw = false;
        const mapBounds = map.getBounds();

        if ( Dom.prop("#zoom-to-selection", 'checked') )
            zoomToSelectedPaths();

    });
}

function handle_table_selections( e, dt, type, indexes ) {
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
