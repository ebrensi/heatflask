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

const ohm_char = String.fromCodePoint(2384);
const sailboat_char = String.fromCodePoint(0x26f5);
//<a href="https://iconscout.com/icons/ice-skating" target="_blank">Ice skating Icon</a> by <a href="https://iconscout.com/contributors/scott-de-jonge">Scott De Jonge</a> on <a href="https://iconscout.com">Iconscout</a>
//<a href="https://iconscout.com/icons/canoe" target="_blank">Canoe Icon</a> by <a href="https://iconscout.com/contributors/babycorn" target="_blank">Mister Jo</a>
//<a href="https://iconscout.com/icons/canoe" target="_blank">Canoe Icon</a> by <a href="https://iconscout.com/contributors/payuan-amin" target="_blank">Payuan Amin</a>
//
/**
 * This is a list of tuples specifying properties of the rendered objects,
 * such as path color, speed/pace in description.  others can be added
 * @type {Object}
 */
const _specs = {
  canoeing: [null, null, ],
  crossfit: [null, null, '<i class="fas fa-weight-hanging"></i>'],
  ebikeride: ["speed", "#0000cd", '<i class="fas fa-motorcycle"></i>'], // mediumblue
  elliptical: [null, null],
  golf: [null, null, '<i class="fas fa-golf-ball"></i>'],
  handcycle: [null, null, '<i class="fab fa-accessible-icon"></i>'],
  hike: ["pace", "#ff1493", '<i class="fas fa-hiking"></i>'], // deeppink
  iceskate: ["speed", "#663399", '<i class="fas fa-skating"></i>'], // rebeccapurple
  inlineskate: [null, "#8a2be2", '<i class="fas fa-skating"></i>'], // blueviolet
  kayaking: [null, "#ffa500", '<i class="fas fa-skating"></i>'], // orange
  kitesurf: ["speed", null],
  nordicski: [null, "#800080", '<i class="fas fa-skiing-nordic"></i>'], // purple
  ride: ["speed", "#2b60de", '<i class="fas fa-biking"></i>'], // ocean blue
  rockclimbing: [null, "#4b0082", "climbing"], // indigo
  rollerski: ["speed", "#800080", '<i class="fas fa-skiing-nordic"></i>'], // purple
  rowing: ["speed", "#fa8072"], // salmon
  run: ["pace", "#ff0000", '<i class="fas fa-running"></i>'], // red
  sail: [null, null, sailboat_char],
  skateboard: [null, null],
  snowboard: [null, "#00ff00", '<i class="fas fa-snowboarding"></i>'], // lime
  snowshoe: ["pace", "#800080"], // purple
  soccer: [null, null, '<i class="fas fa-futbol"></i>'],
  stairstepper: [null, null],
  standuppaddling: [null, null, "paddling"],
  surfing: [null, "#006400", "surf"], // darkgreen
  swim: ["speed", "#00ff7f", '<i class="fas fa-swimmer"></i>'], // springgreen
  velomobile: [null, null],
  virtualride: ["speed", "#1e90ff", '<i class="fas fa-bicycle"></i>'], // dodgerblue
  virtualrun: [null, null, '<i class="fas fa-running"></i>'],
  walk: ["pace", "#ff00ff", '<i class="fas fa-walking"></i>'], // fuchsia
  weighttraining: [null, null, '<i class="fas fa-weight-hanging"></i>'],
  wheelchair: [null, null, '<i class="fas fa-wheelchair"></i>'],
  windsurf: ["speed", null],
  workout: [null, null],
  yoga: [null, null, ohm_char],
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
