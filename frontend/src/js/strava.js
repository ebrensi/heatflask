/*
 * Strava related stuff
 */

// import "../css/custom-icons.css";

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
  AlpineSki: ["speed", "#800080", '<i class="ci ci-alpine-ski"></i>'],
  BackcountrySki: [null, null],
  Canoeing: ["speed", "#fa8080", '<i class="ci ci-canoe"></i>'],
  Crossfit: [null, null, '<i class="ci ci-crossfit"></i>'],
  EBikeRide: ["speed", "#0000cd", '<i class="fas fa-motorcycle"></i>'], // mediumblue
  Elliptical: [null, null],
  Golf: [null, null, '<i class="fas fa-golf-ball"></i>'],
  Handcycle: ["speed", "#2b60de", '<i class="fab fa-accessible-icon"></i>'],
  Hike: ["pace", "#ff1493", '<i class="fas fa-hiking"></i>'], // deeppink
  IceSkate: ["speed", "#663399", '<i class="fas fa-skating"></i>'], // rebeccapurple
  InlineSkate: ["speed", "#8a2be2", '<i class="ci ci-roller-skate"></i>'], // blueviolet
  Kayaking: ["speed", "#ffa500", '<i class="ci ci-kayak"></i>'], // orange
  Kitesurf: ["speed", "#00ff00", '<i class="ci ci-kitesurf"></i>'],
  NordicSki: ["speed", "#800080", '<i class="fas fa-skiing-nordic"></i>'], // purple
  Ride: ["speed", "#2b60de", '<i class="fas fa-biking"></i>'], // ocean blue
  RockClimbing: [null, "#4b0082", '<i class="ci ci-climb"></i>'], // indigo
  RollerSki: ["speed", "#800080", '<i class="ci ci-roller-ski"></i>'], // purple
  Rowing: ["speed", "#fa8072", '<i class="ci ci-rowing"></i>'], // salmon
  Run: ["pace", "#ff0000", '<i class="fas fa-running"></i>'], // red
  Sail: ["speed", "#8a2be2", '<i class="ci ci-sailboat"></i>'],
  Skateboard: ["speed", "#800080", '<i class="ci ci-skateboarding"></i>'],
  Snowboard: ["speed", "#00ff00", '<i class="fas fa-snowboarding"></i>'], // lime
  Snowshoe: ["pace", "#800080", '<i class="ci ci-snowshoes"></i>'], // purple
  Soccer: ["pace", "#8a2be2", '<i class="ci ci-soccer"></i>'],
  StairStepper: ["pace", null, '<i class="ci ci-stairs"></i>'],
  StandUpPaddling: ["speed", "#800080", '<i class="ci ci-standup-paddle"></i>'],
  Surfing: ["speed", "#006400", '<i class="ci ci-surf"></i>'], // darkgreen
  Swim: ["speed", "#00ff7f", '<i class="fas fa-swimmer"></i>'], // springgreen
  Velomobile: ["speed", null],
  VirtualRide: ["speed", "#1e90ff", '<i class="ci ci-spinning"></i>'], // dodgerblue
  VirtualRun: ["pace", null, '<i class="ci ci-treadmill"></i>'],
  Walk: ["pace", "#ff00ff", '<i class="fas fa-walking"></i>'], // fuchsia
  WeightTraining: [null, null, '<i class="ci ci-weights"></i>'],
  Wheelchair: ["speed", "#2b60de", '<i class="fas fa-wheelchair"></i>'],
  Windsurf: ["speed", "#4b0082", '<i class="ci ci-windsurf"></i>'],
  Workout: [null, null, "#4b0082", '<i class="ci ci-activity"></i>'],
  Yoga: [null, null, '<i class="ci ci-meditate"></i>'],
  undefined: [null, '<i class="ci ci-activity"></i>'],
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
    const spec =
      _specs[type] || _specs[type.toLowerCase()] || _specs[undefined];
    return spec[1];
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
    const spec =
      _specs[type] || _specs[type.toLowerCase()] || _specs[undefined];

    return { vtype: spec[0], pathColor: spec[1], name: spec[2] || type };
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
