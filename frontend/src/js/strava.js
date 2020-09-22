/*
 * Strava related stuff
 */

/**
 * @param  {(String|Number)} id - A Strava activity id
 * @return {String} The Strava URL for that activity
 */
export function activityURL(id) {
  return `https://www.strava.com/activities/${id}`;
}

/**
 * @param  {(String|Number)} id - Strava user-id
 * @return {String} The Strava URL for that user
 */
export function athleteURL(id) {
  return `https://www.strava.com/athletes/${id}`;
}

/**
 * This is a list of tuples specifying properties of the rendered objects,
 * such as path color, speed/pace in description.  others can be added.
 * @see  https://developers.strava.com/docs/reference/#api-models-ActivityType
 *
 * @type {Object}
 */
const _specs = {
  AlpineSki: [null, null],
  BackcountrySki: [null, null],
  Canoeing: [null, null],
  Crossfit: [null, null, '<i class="fas fa-weight-hanging"></i>'],
  EBikeRide: ["speed", "#0000cd", '<i class="fas fa-motorcycle"></i>'], // mediumblue
  Elliptical: [null, null],
  Golf: [null, null, '<i class="fas fa-golf-ball"></i>'],
  Handcycle: [null, null, '<i class="fab fa-accessible-icon"></i>'],
  Hike: ["pace", "#ff1493", '<i class="fas fa-hiking"></i>'], // deeppink
  IceSkate: ["speed", "#663399", '<i class="fas fa-skating"></i>'], // rebeccapurple
  InlineSkate: [null, "#8a2be2", '<i class="fas fa-skating"></i>'], // blueviolet
  Kayaking: [null, "#ffa500", '<i class="fas fa-skating"></i>'], // orange
  Kitesurf: ["speed", null],
  NordicSki: [null, "#800080", '<i class="fas fa-skiing-nordic"></i>'], // purple
  Ride: ["speed", "#2b60de", '<i class="fas fa-biking"></i>'], // ocean blue
  RockClimbing: [null, "#4b0082", "climbing"], // indigo
  RollerSki: ["speed", "#800080"], // purple
  Rowing: ["speed", "#fa8072"], // salmon
  Run: ["pace", "#ff0000", '<i class="fas fa-running"></i>'], // red
  Sail: [null, null],
  Skateboard: [null, null],
  Snowboard: [null, "#00ff00", '<i class="fas fa-snowboarding"></i>'], // lime
  Snowshoe: ["pace", "#800080"], // purple
  Soccer: [null, null, '<i class="fas fa-futbol"></i>'],
  StairStepper: [null, null],
  StandUpPaddling: [null, null, "paddling"],
  Surfing: [null, "#006400", "surf"], // darkgreen
  Swim: ["speed", "#00ff7f", '<i class="fas fa-swimmer"></i>'], // springgreen
  Velomobile: [null, null],
  VirtualRide: ["speed", "#1e90ff", '<i class="fas fa-bicycle"></i>'], // dodgerblue
  VirtualRun: [null, null, '<i class="fas fa-running"></i>'],
  Walk: ["pace", "#ff00ff", '<i class="fas fa-walking"></i>'], // fuchsia
  WeightTraining: [null, null, '<i class="fas fa-weight-hanging"></i>'],
  Wheelchair: [null, null, '<i class="fas fa-wheelchair"></i>'],
  Windsurf: ["speed", null],
  Workout: [null, null],
  Yoga: [null, null],
  undefined: [null, null],
};

export const ATYPE = {
  /**
   * @return {Iterable.<String>} An Iterable of names of the
   *                                Strava activity types that we support
   */
  types: function () {
    return Object.keys(_specs);
  },

  /**
   * @param  {String} type The activity type (one of the keys of {@link _specs})
   * @return {String} The color code for that activity type
   */
  pathColor: function (type) {
    const spec = _specs[type.toLowerCase()] || _specs[undefined];
    return spec[1];
  },

  /**
   * @typedef {atypeSpec}
   * @property {(String|null)} vtype "speed" or "pace" (or null)
   * @property {String} pathColor  Path color (or null)
   * @property {String} [type] Alternate name for this activity type
   */

  /**
   * [specs description]
   * @param  {String} type The activity type (one of {@link _specs})
   * @return {atypeSpec} An object with specs for this activity type
   */
  specs: function (type) {
    const atype = type.toLowerCase(),
      spec = _specs[atype] || _specs[undefined];

    return { vtype: spec[0], pathColor: spec[1], type: spec[2] || type };
  },
};

/* This function appends CSS style color defs for activity type
 *  to a DOM element for <span> children. Then, for example,
 * the text in elelment <span class="run"> text </span>
 *  will have the path-color associated with "run".
 *
 * @param  {Element} domElement [description]
 */
export function appendCSS(domElement) {
  /* define a CSS stylesheet for strava path colors */
  const sheet = document.createElement("style");
  let string = "";

  for (const type of ATYPE.types()) {
    const color = ATYPE._specs[type][1];
    if (color) {
      string += `span.${type}{color:${color}}`;
    }
  }

  sheet.innerHTML = string;

  console.log(string);
  domElement.appendChild(sheet);
}
