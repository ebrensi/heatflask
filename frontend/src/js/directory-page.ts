import "../ext/min_entireframework.css"
import { img, href } from "./appUtil"

console.log(`Environment: ${process.env.NODE_ENV}`)

function user_thumbnail(id, img_url) {
  const avatar = img(img_url, 40, 40, id)
  const link = "/" + id
  return href(link, avatar)
}

// Field names
const ID = "_id",
  LAST_LOGIN = "ts",
  LOGIN_COUNT = "#",
  LAST_INDEX_ACCESS = "I",
  FIRSTNAME = "f",
  LASTNAME = "l",
  PROFILE = "P",
  CITY = "c",
  STATE = "s",
  COUNTRY = "C",
  PRIVATE = "p"


const HEADERS = ["", "Name", "City", "Region", "Country"]
const REQUIRED_FIELDS = [ID, FIRSTNAME, LASTNAME, PROFILE, CITY, STATE, COUNTRY]
function makeRow(rowData) {
  const [_id, firstname, lastname, profile, city, state, country] = rowData
  return [
    user_thumbnail(_id, profile),
    `${firstname} ${lastname}`,
    city,
    state,
    country,
  ]
}

const ADMIN_HEADERS = [
  "ID",
  "LoginCount",
  "LastLogin",
  "LastAccess",
  "Name",
  "City",
  "Region",
  "Country",
  "private",
]
const ADMIN_REQUIRED_FIELDS = [
  ID,
  PROFILE,
  CITY,
  STATE,
  COUNTRY,
  FIRSTNAME,
  LASTNAME,
  LAST_LOGIN,
  LOGIN_COUNT,
  LAST_INDEX_ACCESS,
  PRIVATE,
]
function makeAdminRow(rowData) {
  const [
    _id,
    profile,
    city,
    state,
    country,
    firstname,
    lastname,
    last_login,
    login_count,
    last_index_access,
    priv,
  ] = rowData

  return [
    user_thumbnail(_id, profile),
    login_count,
    last_login,
    last_index_access,
    new Date(1000 * ts).toLocaleDateString(),
    `${firstname} ${lastname}`,
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

  // The first row we get is field names
  // which we will use to determine field ordering
  const fields = data[0]
  const field_pos = {}
  for (let i = 0; i < fields.length; i++) {
    field_pos[fields[i]] = i
  }
  const required_fields = admin ? ADMIN_REQUIRED_FIELDS : REQUIRED_FIELDS
  const permutation = required_fields.map((f) => field_pos[f])

  const rowFunc = admin ? makeAdminRow : makeRow
  const row_strs = new Array(n_rows - 1)
  for (let i = 1; i < n_rows; i++) {
    const row = data[i]
    const permuted_row = permutation.map((j) => row[j])
    const cells = rowFunc(permuted_row).join("</td><td>")
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
