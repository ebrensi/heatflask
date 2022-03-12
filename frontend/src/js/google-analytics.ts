/*
 *  google-analytics.js -- exports a function that will insert
 *   	the google analytics snippets.
 */

const GOOGLE_ANALYTICS_ACCOUNT_ID = "UA-85621398-1"

export default function load_ga_object() {
  ;(function (i, s, o, g, r, a, m) {
    i["GoogleAnalyticsObject"] = r
    ;(i[r] =
      i[r] ||
      function () {
        ;(i[r].q = i[r].q || []).push(arguments)
      }),
      (i[r].l = 1 * new Date())
    ;(a = s.createElement(o)), (m = s.getElementsByTagName(o)[0])
    a.async = 1
    a.src = g
    m.parentNode.insertBefore(a, m)
  })(
    window,
    document,
    "script",
    "https://www.google-analytics.com/analytics.js",
    "ga"
  )

  const ga = window["ga"]

  // Creates a default tracker with automatic cookie domain configuration.
  ga("create", GOOGLE_ANALYTICS_ACCOUNT_ID, "auto")

  // Sends a pageview hit from the tracker just created.
  ga("send", "pageview")

  return ga
}
