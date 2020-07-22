/*
 * Strava related stuff
 * @module
 */

/**
 * @param  {(String|Number)} A Strava activity id
 * @return {String} The Strava URL for that activity
 */
export function activityURL(id) {
  return `https://www.strava.com/activities/${id}`;
}

/**
 * @param  {(String|Number)} Strava user-id
 * @return {String} The Strava URL for that user
 */
export function athleteURL(id) {
  return `https://www.strava.com/athletes/${id}`;
}


/**
 * This is a list of tuples specifying properties of the rendered objects,
 * such as path color, speed/pace in description.  others can be added
 * @type {Object}
 */
const _specs = {
    "canoeing": [null, null],
    "crossfit": [null, null],
    "ebikeride": ["speed", "#0000cd"], // mediumblue
    "elliptical": [null, null],
    "golf": [null, null],
    "handcycle": [null, null],
    "hike": ["pace", "#ff1493"], // deeppink
    "iceskate": ["speed", "#663399"], // rebeccapurple
    "inlineskate": [null, "#8a2be2"], // blueviolet
    "kayaking": [null, "#ffa500"], // orange
    "kitesurf": ["speed", null],
    "nordicski": [null, "#800080"], // purple
    "ride": ["speed", "#2b60de"], // ocean blue
    "rockclimbing": [null, "#4b0082", "climbing"], // indigo
    "rollerski": ["speed", "#800080"], // purple
    "rowing": ["speed", "#fa8072"], // salmon
    "run": ["pace", "#ff0000"], // red
    "sail": [null, null],
    "skateboard": [null, null],
    "snowboard": [null, "#00ff00"], // lime
    "snowshoe": ["pace", "#800080"], // purple
    "soccer": [null, null],
    "stairstepper": [null, null],
    "standuppaddling": [null, null, "paddling"],
    "surfing": [null, "#006400"], // darkgreen
    "swim": ["speed", "#00ff7f"], // springgreen
    "velomobile": [null, null],
    "virtualride": ["speed", "#1e90ff"], // dodgerblue
    "virtualrun": [null, null],
    "walk": ["pace", "#ff00ff"], // fuchsia
    "weighttraining": [null, null, "weights"],
    "wheelchair": [null, null],
    "windsurf": ["speed", null],
    "workout": [null, null],
    "yoga": [null, null],
    "undefined": [null, null],
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
