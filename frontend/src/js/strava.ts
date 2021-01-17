/*
 * Strava related stuff
 */

/* Custom font-font set from Icomoon */

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

export function icon(name) {
  return `<span class="icon atype-${name}"></span>`
}

/**
 * This is a list of tuples specifying properties of the rendered objects,
 * such as path color, speed/pace in description.  others can be added.
 * @see  https://developers.strava.com/docs/reference/#api-models-ActivityType
 *
 * @type {Object}
 */
const _specs = {
  AlpineSki: ["speed", "#800080", icon("skiing")],
  BackcountrySki: ["speed", "#800080", icon("xc-ski")],
  Canoeing: ["speed", "#fa8080", icon("canoe")],
  Crossfit: [null, null, icon("crossfit")],
  EBikeRide: ["speed", "#0000cd", icon("motorcycle")], // mediumblue
  Elliptical: [null, null],
  Golf: [null, null, icon("golf")],
  Handcycle: ["speed", "#2b60de", icon("handbike")],
  Hike: ["pace", "#ff1493", icon("hiking")], // deeppink
  IceSkate: ["speed", "#663399", icon("skating")], // rebeccapurple
  InlineSkate: ["speed", "#8a2be2", icon("inline-skating")], // blueviolet
  Kayaking: ["speed", "#ffa500", icon("kayak")], // orange
  Kitesurf: ["speed", "#00ff00", icon("kitesurf")],
  NordicSki: ["speed", "#800080", icon("skiing-nordic")], // purple
  Ride: ["speed", "#2b60de", icon("bicycle")], // ocean blue
  RockClimbing: [null, "#4b0082", icon("climbing")], // indigo
  RollerSki: ["speed", "#800080", icon("roller-ski")], // purple
  Rowing: ["speed", "#fa8072", icon("rowing")], // salmon
  Run: ["pace", "#ff0000", icon("running")], // red
  Sail: ["speed", "#8a2be2", icon("sailboat")],
  Skateboard: ["speed", "#800080", icon("skateboarding")],
  Snowboard: ["speed", "#00ff00", icon("snowboarding")], // lime
  Snowshoe: ["pace", "#800080", icon("snowshoes")], // purple
  Soccer: ["pace", "#8a2be2", icon("soccer")],
  StairStepper: ["pace", null, icon("stairs")],
  StandUpPaddling: ["speed", "#800080", icon("sup-paddle")],
  Surfing: ["speed", "#006400", icon("surf")], // darkgreen
  Swim: ["speed", "#00ff7f", icon("swimming")], // springgreen
  Velomobile: ["speed", null, null],
  VirtualRide: ["speed", "#1e90ff", icon("spinning")], // dodgerblue
  VirtualRun: ["pace", null, icon("treadmill")],
  Walk: ["pace", "#ff00ff", icon("walking")], // fuchsia
  WeightTraining: [null, null, icon("weights")],
  Wheelchair: ["speed", "#2b60de", icon("wheelchair")],
  Windsurf: ["speed", "#4b0082", icon("windsurf")],
  Workout: [null, null, "#4b0082", icon("activity")],
  Yoga: [null, null, icon("meditate")],
  undefined: ["speed", null, icon("activity")],
}

export const ATYPE = {
  /**
   * @return {Iterable.<String>} An Iterable of names of the
   *                                Strava activity types that we support
   */
  types: Object.keys(_specs),

  index: (() => {
    const index = {}
    let i = 0
    for (const type of Object.keys(_specs)) {
      index[type] = i++
    }
    return index
  })(),

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
