const GOOGLE_ANALYTICS_ACCOUNT_ID = "UA-85621398-1"

/**
 * Load in the google analytics object
 * @see https://developers.google.com/analytics/devguides/collection/analyticsjs
 */
export function load_ga_object() {
  ;(function (i, s, o, g, r, a, m) {
    i["GoogleAnalyticsObject"] = r
    ;(i[r] =
      i[r] ||
      function () {
        // eslint-disable-next-line prefer-rest-params
        ;(i[r].q = i[r].q || []).push(arguments)
      }),
      (i[r].l = Date.now())
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

  const ga = window.ga

  // Creates a default tracker with automatic cookie domain configuration.
  ga("create", GOOGLE_ANALYTICS_ACCOUNT_ID, "auto")

  // Sends a pageview hit from the tracker just created.
  ga("send", "pageview")
  ga("set", "allowAdFeatures", false)

  return ga
}
