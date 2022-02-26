import "../ext/min_entireframework.css"

console.log(`Environment: ${process.env.NODE_ENV}`)
// const argstring = document.querySelector("#runtime_json").innerText
// const runtime_json = JSON.parse(argstring)
const url = window.url

async function run() {
  console.log(`fetching ${url}`)
  const response = await fetch(url)
  const data = await response.json()

  const n_rows = data.length,
    n_cols = data[0].length,
    keys = data[0]

  const headers = keys.join("</th><th>")
  const thead_str = `<thead><th>${headers}</th></thead>\n`

  const row_strs = new Array(n_rows - 1)
  for (let i = 1; i < n_rows; i++) {
    const cells = data[i].join("</td><td>")
    row_strs[i - 1] = `<tr><td>${cells}</td></tr>`
  }
  const rows_str = row_strs.join("\n")
  const tbody_str = `<tbody>\n${rows_str}\n</tbody>`

  const table_element: HTMLTableElement = document.getElementById("users")
  table_element.innerHTML = thead_str + tbody_str
}

;(async () => {
  try {
    await run()
  } catch (e) {
    console.log("oops. ", e)
  }
})()

// function combineNames(data, type, row, meta) {
//     return row.lastname + ", " + row.firstname;
// }

// const data = {{ data|tojson }};
// let atable = $('#users_table').DataTable({
//     pageLength: 100,
//     deferRender: true,
//     scroller: true,
//     data: data,
//     columns: [
//         {title: "",    data: "id", render: formatUserId},
//         {title: "username",  data: "username"},
//         {title: "City",    data: "city"},
//         {title: "Region",    data: "state"},
//         {title: "Country", data: "country"},
//         {
//             title: "last active",
//             data: "dt_last_active",
//             render: formatDate,
//         }
//     ],
//     scrollY: "80vh",
//     scrollX: true,
//     scrollCollapse: true,
//     select: false,
//     order: [[ 5, "desc" ]]
// });
