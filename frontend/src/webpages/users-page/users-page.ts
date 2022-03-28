import { img, href, sleep } from "~/src/js/appUtil"
import { icon } from "~/src/js/Icons"
import { JSTable } from "~/src/js/jstable"

const status_el = document.getElementById("status")

console.log(`Environment: ${process.env.NODE_ENV}`)

function user_thumbnail(id, img_url) {
  if (!(id && img_url)) return ""
  const avatar = img(img_url, 40, 40, id)
  return href(`/${id}`, avatar)
}

function ts_to_dt(ts, time = false) {
  if (!ts) {
    return ""
  }
  const dt = new Date(1000 * ts)
  return time ? dt.toLocaleString() : dt.toLocaleDateString()
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

const priv_icon = icon("eye-blocked")
const pub_icon = icon("eye")
const ADMIN_HEADERS = [
  "ID",
  icon("user-secret"),
  "# Logins",
  "LastLogin",
  "IndexAccess",
  "Name",
  "City",
  "Region",
  "Country",
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

  // console.log(rowData)
  const picon = priv ? priv_icon : pub_icon
  return [
    user_thumbnail(_id, profile),
    picon,
    login_count,
    ts_to_dt(last_login),
    ts_to_dt(last_index_access),
    `${firstname} ${lastname}`,
    city,
    state,
    country,
  ]
}

async function run() {
  status_el.classList.add("spinner")
  console.time("maketable")
  const response = await fetch(url, { method: "POST" })
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

  const myTable = new JSTable(table_element, {
    sortable: true,
    searchable: true,
    perPage: 12,
  })
  await sleep(0.2)
  status_el.classList.remove("spinner")
}

;(async () => {
  try {
    await run()
  } catch (e) {
    console.log("oops. ", e)
  }
})()
