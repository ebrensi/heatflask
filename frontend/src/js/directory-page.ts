import "../ext/min_entireframework.css"
import { img, href } from "./appUtil"

console.log(`Environment: ${process.env.NODE_ENV}`)

function user_thumbnail(id, img_url) {
  const avatar = img(img_url, 40, 40, id)
  const link = "/" + id
  return href(link, avatar)
}

const HEADERS = ["", "username", "City", "Region", "Country"]
function makeRow(rowData) {
  const [_id, username, profile, city, state, country] = rowData
  return [user_thumbnail(_id, profile), username, city, state, country]
}

const ADMIN_HEADERS = [
  "ID",
  "count",
  "last_active",
  "Name",
  "City",
  "Region",
  "Country",
  "private",
]

function makeAdminRow(rowData) {
  const [
    _id,
    username,
    profile,
    city,
    state,
    country,
    firstname,
    lastname,
    ts,
    access_count,
    priv,
  ] = rowData

  return [
    user_thumbnail(_id, profile),
    access_count,
    new Date(1000 * ts).toLocaleDateString(),
    firstname + " " + lastname,
    city,
    state,
    country,
    priv,
  ]
}

async function run() {
  console.log(`fetching ${url}`)
  console.time("maketable")
  const response = await fetch(url)
  const data = await response.json()

  const n_rows = data.length

  const header_data = admin ? ADMIN_HEADERS : HEADERS
  const headers = header_data.join("</th><th>")
  const thead_str = `<thead><th>${headers}</th></thead>\n`

  const rowFunc = admin ? makeAdminRow : makeRow
  const row_strs = new Array(n_rows - 1)
  for (let i = 1; i < n_rows; i++) {
    const cells = rowFunc(data[i]).join("</td><td>")
    row_strs[i - 1] = `<tr><td>${cells}</td></tr>`
  }
  const rows_str = row_strs.join("\n")
  const tbody_str = `<tbody>\n${rows_str}\n</tbody>`

  const table_element: HTMLTableElement = document.getElementById("users")
  table_element.innerHTML = thead_str + tbody_str
  console.timeEnd("maketable")
}

;(async () => {
  try {
    await run()
  } catch (e) {
    console.log("oops. ", e)
  }
})()
