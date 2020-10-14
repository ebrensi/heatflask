/*
 * Strava related stuff
 */

// import "../css/custom-icons.css";

/**
 * @param  {(String|Number)} id - A Strava activity id
 * @return {String} The Strava URL for that activity
 */
export function activityURL(id) {
  return `https://www.strava.com/activities/${id}`
}

/**
 * @param  {(String|Number)} id - Strava user-id
 * @return {String} The Strava URL for that user
 */
export function athleteURL(id) {
  return `https://www.strava.com/athletes/${id}`
}

/**
 * This is a list of tuples specifying properties of the rendered objects,
 * such as path color, speed/pace in description.  others can be added.
 * @see  https://developers.strava.com/docs/reference/#api-models-ActivityType
 *
 * @type {Object}
 */
const _specs = {
  AlpineSki: ["speed", "#800080", '<i class="icon-skiing"></i>'],
  BackcountrySki: ["speed", "#800080", '<i class="icon-xc-ski"></i>'],
  Canoeing: ["speed", "#fa8080", '<i class="icon-canoe"></i>'],
  Crossfit: [null, null, '<i class="icon-crossfit"></i>'],
  EBikeRide: ["speed", "#0000cd", '<i class="icon-motorcycle x2"></i>'], // mediumblue
  Elliptical: [null, null],
  Golf: [null, null, '<i class="icon-golf"></i>'],
  Handcycle: ["speed", "#2b60de", '<i class="icon-handbike"></i>'],
  Hike: ["pace", "#ff1493", '<i class="icon-hiking x2"></i>'], // deeppink
  IceSkate: ["speed", "#663399", '<i class="icon-skating"></i>'], // rebeccapurple
  InlineSkate: ["speed", "#8a2be2", '<i class="icon-inline-skating x2"></i>'], // blueviolet
  Kayaking: ["speed", "#ffa500", '<i class="icon-kayak"></i>'], // orange
  Kitesurf: ["speed", "#00ff00", '<i class="icon-kitesurf"></i>'],
  NordicSki: ["speed", "#800080", '<i class="icon-skiing-nordic"></i>'], // purple
  Ride: ["speed", "#2b60de", '<i class="icon-bicycle x2"></i>'], // ocean blue
  RockClimbing: [null, "#4b0082", '<i class="icon-climbing"></i>'], // indigo
  RollerSki: ["speed", "#800080", '<i class="icon-roller-ski"></i>'], // purple
  Rowing: ["speed", "#fa8072", '<i class="icon-rowing"></i>'], // salmon
  Run: ["pace", "#ff0000", '<i class="icon-running x2"></i>'], // red
  Sail: ["speed", "#8a2be2", '<i class="icon-sailboat"></i>'],
  Skateboard: ["speed", "#800080", '<i class="icon-skateboarding"></i>'],
  Snowboard: ["speed", "#00ff00", '<i class="icon-snowboarding"></i>'], // lime
  Snowshoe: ["pace", "#800080", '<i class="icon-snowshoes"></i>'], // purple
  Soccer: ["pace", "#8a2be2", '<i class="icon-soccer"></i>'],
  StairStepper: ["pace", null, '<i class="icon-stairs"></i>'],
  StandUpPaddling: ["speed", "#800080", '<i class="icon-sup-paddle"></i>'],
  Surfing: ["speed", "#006400", '<i class="icon-surf"></i>'], // darkgreen
  Swim: ["speed", "#00ff7f", '<i class="icon-swimming"></i>'], // springgreen
  Velomobile: ["speed", null, null],
  VirtualRide: ["speed", "#1e90ff", '<i class="icon-spinning"></i>'], // dodgerblue
  VirtualRun: ["pace", null, '<i class="icon-treadmill"></i>'],
  Walk: ["pace", "#ff00ff", '<i class="icon-walking x2"></i>'], // fuchsia
  WeightTraining: [null, null, '<i class="icon-weights"></i>'],
  Wheelchair: ["speed", "#2b60de", '<i class="icon-wheelchair"></i>'],
  Windsurf: ["speed", "#4b0082", '<i class="icon-windsurf"></i>'],
  Workout: [null, null, "#4b0082", '<i class="icon-activity"></i>'],
  Yoga: [null, null, '<i class="icon-meditate"></i>'],
  undefined: ["speed", null, '<i class="icon-activity"></i>'],
}

export const ATYPE = {
  /**
   * @return {Iterable.<String>} An Iterable of names of the
   *                                Strava activity types that we support
   */
  types: function () {
    return Object.keys(_specs)
  },

  /**
   * @param  {String} type The activity type (one of the keys of {@link _specs})
   * @return {String} The color code for that activity type
   */
  pathColor: function (type) {
    const spec = _specs[type] || _specs[type.toLowerCase()] || _specs[undefined]
    return spec[1]
  },

  /**
   * @typedef {atypeSpec}
   * @property {(String|null)} vtype "speed" or "pace" (or null)
   * @property {String} pathColor  Path color (or null)
   * @property {String} [name] Alternate name for this activity type
   */

  /**
   * [specs description]
   * @param  {String} type The activity type (one of {@link _specs})
   * @return {atypeSpec} An object with specs for this activity type
   */
  specs: function (type) {
    const spec = _specs[type] || _specs[type.toLowerCase()] || _specs[undefined]

    return { vtype: spec[0], pathColor: spec[1], name: spec[2] || type }
  },
}

/* This function appends CSS style color defs for activity type
 *  to a DOM element for <span> children. Then, for example,
 * the text in elelment <span class="run"> text </span>
 *  will have the path-color associated with "run".
 *
 * @param  {Element} domElement [description]
 */
export function appendCSS(domElement) {
  /* define a CSS stylesheet for strava path colors */
  const sheet = document.createElement("style")
  let string = ""

  for (const type of ATYPE.types()) {
    const color = _specs[type][1]
    if (color) {
      string += `span.${type}{background-color:${color}}`
    }
  }

  sheet.innerHTML = string
  domElement.appendChild(sheet)
}
