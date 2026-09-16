# Message catalogs

One JSON file per language. `en.json` is the source of truth: every string the
front end shows is in it, and English is the fallback for any key a translation
has not got to yet.

Shipping eleven: English, German, Spanish, French, Italian, Japanese,
Brazilian and European Portuguese, Russian, and Chinese in both Simplified and
Traditional. All but English are a machine first pass -- **they have not been
read by a native speaker**, and corrections are the point.
The keys most likely to be wrong are the terse ones, where the English gives a
translator nothing to go on: `tab.controls.*` (the dial labels) and
`tab.info.*` (the help text).

|         |                                  |
| ------- | -------------------------------- |
| Runtime | [`../js/i18n.ts`](../js/i18n.ts) |
| Checker | `npm run i18n:check`             |
| Preview | `?lang=ja` on any page           |

## Adding a language

Two steps. Say it is Dutch, `nl`:

**1. Write `nl.json`** — same keys as `en.json`, translated values. It does not
have to be complete; anything missing falls back to English, so a half-finished
catalog is shippable.

**2. Register it** in [`../js/i18n.ts`](../js/i18n.ts), which is two lines:

```ts
import NL_JSON from "../locales/nl.json" // add

const CATALOGS: Record<string, Catalog> = {
  nl: <Catalog>NL_JSON, // add
}
```

That is all. Every catalog is bundled into the build rather than fetched, so
there is nothing to deploy separately and no loading state to handle.

Then `npm run i18n:check`, and look at it with `?lang=nl`.

### Variants of the same language

A regional or script catalog is registered under its full tag -- `pt-BR`,
`zh-Hant` -- and `ALIASES` in `i18n.ts` says where the tags that do not name
a catalog outright should go.

Chinese needs that table. The split is by script, which a region implies but
never states: `zh-TW` and `zh-HK` are written in Traditional, `zh-CN` and
`zh-SG` in Simplified, and bare `zh` is conventionally Simplified. Matching on
the base language alone would hand a reader in Taipei the mainland catalog --
readable, but visibly foreign, and wrong in vocabulary as much as in
characters (`用戶`/`使用者`, `視頻`/`影片`).

Portuguese needs it only to break a tie: both catalogs are real, and `pt` on
its own goes to `pt-BR` because that is where the users are. An unrecognised
region falls the same way, so `pt-AO` gets Brazilian.

## How a reader gets a language

In order:

1. **The language menu** in the sidebar's `i` tab, which writes the choice to
   `localStorage` and reloads. It lists every catalog by its own name for
   itself -- Deutsch, 日本語, русский -- from `Intl.DisplayNames`, so adding a
   catalog adds its option and nothing here needs a list of names.
2. **`?lang=ja`** in the URL, which wins over a stored choice and replaces it.
3. **The browser**, via `navigator.languages`, in its own order of preference.
4. English.

A tag is matched by dropping one subtag at a time and looking at each length
for a catalog and then for an alias, so `zh-Hant-TW` finds `zh-Hant` by its
script and `zh-TW` finds it by its region. Anything left over falls back to
any catalog in the same base language: `de-CH` gets `de`.

The menu's **Automatic** entry clears the stored choice and hands the decision
back to the browser.

`?lang=` does **not** stay in the address bar — `URL.ts` rebuilds the query
string from the model on every map move and drops arguments it does not know.
That is why the choice is remembered. A link with `?lang=ja` still works for
whoever opens it.

## Writing a translation

**Keys never change.** The left-hand side of every pair is an identifier, not
text. Translate only the value.

**`{fields}` must survive, spelled exactly.** They are filled in at runtime:

```json
"users.daysAgo":  "{count} days ago",
"tab.query.title": "{name}'s map",
"capture.record":  "Record video ({period}s loop)"
```

They can move anywhere in the sentence — that is the point of them. A field
that is misspelled or dropped shows up as literal `{count}` in the UI.

**Inline HTML must survive, and may move.** 17 strings carry a `<kbd>`, an
icon `<i>`, or a link:

```json
"tab.info.ctrlDragKey": "<kbd>Ctrl</kbd> + drag",
"tab.query.autozoom":   "Auto-Zoom <i class=\"hf hf-bullseye\"></i> to query after import"
```

Keep the tags and their attributes byte-for-byte; put them wherever the
sentence needs them. `tab.profile.publicNote` contains the whole
`<a id="profile-directory-link">…</a>` for exactly this reason — the app finds
that link by its id _after_ translating, so it can sit anywhere in the
sentence.

**Plurals.** There is no plural machinery -- one key, one string. Most of the
counted strings are safe because the count cannot be 1 where it would matter,
but `users.monthsAgo` and `users.yearsAgo` can be, so every language uses an
abbreviation there ("{count} mes.", "vor {count} Mon.") the way the English
itself does with "mo" and "yr". `import.count` sidesteps it by putting the
noun first: "Aktivitäten: {received}". If a language needs real plural rules,
that is a change to `t()`, not a thing to fake in the catalog.

**Leave these alone:**

- `τ` and `T` (in `tab.controls.*`) — they name numeric model parameters and
  stay in the Latin alphabet in every language. The words around them are
  yours.
- "Heatflask", "Strava", "GitHub", "Mongo" — product names.
- `<kbd>Ctrl</kbd>`, `<kbd>Esc</kbd>` etc. — these are legends printed on the
  reader's keyboard. The word "drag" beside them is not.

## Testing a translation

**`npm run i18n:check`** first -- it is the only part that is automatic, and
it catches the two mistakes you cannot see by looking (below).

**Then look at it.** Run the app and put `?lang=ja` on the URL, or pick the
language from the menu in the `i` tab. Worth walking through, because these
are the places text goes that a catalog diff does not show you:

- the **sidebar at its real width** (~230px) -- the tightest space in the app,
  and where a long German compound will show up first
- the **`i` tab**, which holds a fifth of all the strings
- the **query tab** mid-import, for the progress dialog and its counts
- the **user directory** at `/users`, for the column headings and "3 days ago"
- **tooltips**: the map controls, and the two cache columns in the activity
  index

**To check the routing rather than the words** -- that a reader in Taiwan or
Brazil lands on the right catalog -- `?lang=` takes any tag, including ones we
have no catalog for, so `?lang=zh-TW`, `?lang=pt-PT` and `?lang=xx` all say
something useful. `<html lang>` in the inspector is the answer: it is set to
whichever catalog actually won.

Remember that the choice is **remembered in `localStorage`**, so a second look
without `?lang=` is still in the language you last asked for. Automatic in the
menu clears it.

## What the checker catches

`npm run i18n:check` reads the source, not just the catalog, and fails on:

- **missing** — a key the code asks for that `en.json` has no string for; the
  UI would show the raw key
- **unused** — a string in `en.json` nothing asks for. A key built at runtime
  never appears whole in the source, so name it in a comment beside the code
  that builds it and it counts as used.
- **stale** — the English left inline in a template has drifted from
  `en.json`'s. The inline copy is the no-JavaScript fallback; the catalog is
  what renders. Strings carrying a `{field}` are skipped, since the two cannot
  match by construction.

It only ever checks `en.json`. Other languages are allowed to be incomplete.

## Where the strings are

124 in total, 25 of them carrying `{fields}` and 17 carrying inline markup.

| Namespace        | n   |                                     |
| ---------------- | --- | ----------------------------------- |
| `common`         | 2   | shared odds and ends                |
| `splash`         | 4   | the logged-out landing page         |
| `tab.query`      | 16  | sidebar: the query form             |
| `tab.activities` | 4   | sidebar: the rendered-activity list |
| `tab.controls`   | 9   | sidebar: the model-parameter dials  |
| `tab.profile`    | 12  | sidebar: account settings           |
| `tab.info`       | 21  | sidebar: the help text              |
| `map`            | 3   | map control tooltips                |
| `capture`        | 12  | video export                        |
| `import`         | 6   | the import-progress dialog          |
| `table`          | 2   | the activity list                   |
| `users`          | 22  | the public user directory           |
| `activities`     | 11  | the activity index page             |

## Before shipping a CJK language

- `i18n.ts` sets `<html lang>`, which is what drives CJK font selection and
  line breaking. Nothing to do, but it is why that line exists.
- The CSS declares no `font-family` on `body`, so Japanese falls back to
  whatever the OS picks. Worth an explicit stack so Latin and CJK look
  deliberate together.
- Check the sidebar at its real width (~230px) — it is the tightest space in
  the app.

## Not covered yet

The seven `flash()` messages in the backend (`bp/main.py`, `bp/auth.py`) are
still English-only. They want to send a key and its params to the front end
rather than a finished sentence, so that there is one catalog rather than a
second i18n stack in Python.
