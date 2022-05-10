/** Strava related stuff
 */

import { icon } from "./Icons"

/** Strava's url for an activity
 */
export function activityURL(id: string | number) {
  return `https://www.strava.com/activities/${id}`
}

/** Strava's url for an Athlete
 */
export function athleteURL(id: string | number) {
  return `https://www.strava.com/athletes/${id}`
}

/**
 * This is a list of tuples specifying properties of the rendered objects,
 * such as path color, speed/pace in description.  others can be added.
 * @see  https://developers.strava.com/docs/reference/#api-models-ActivityType
 */
const atype_specs = {
  AlpineSki: ["speed", "#800080", icon("skiing")],
  BackcountrySki: ["speed", "#800080", icon("xc-ski")],
  Canoeing: ["speed", "#fa8080", icon("canoe")],
  Crossfit: ["", "", icon("crossfit")],
  EBikeRide: ["speed", "#0000cd", icon("motorcycle")], // mediumblue
  Elliptical: ["", "", ""],
  Golf: ["", "", icon("golf")],
  Handcycle: ["speed", "#2b60de", icon("handbike")],
  Hike: ["pace", "#ff1493", icon("hiking")], // deeppink
  IceSkate: ["speed", "#663399", icon("skating")], // rebeccapurple
  InlineSkate: ["speed", "#8a2be2", icon("inline-skating")], // blueviolet
  Kayaking: ["speed", "#ffa500", icon("kayak")], // orange
  Kitesurf: ["speed", "#00ff00", icon("kitesurf")],
  NordicSki: ["speed", "#800080", icon("skiing-nordic")], // purple
  Ride: ["speed", "#2b60de", icon("bicycle")], // ocean blue
  RockClimbing: ["", "#4b0082", icon("climbing")], // indigo
  RollerSki: ["speed", "#800080", icon("roller-ski")], // purple
  Rowing: ["speed", "#fa8072", icon("rowing")], // salmon
  Run: ["pace", "#ff0000", icon("running")], // red
  Sail: ["speed", "#8a2be2", icon("sailboat")],
  Skateboard: ["speed", "#800080", icon("skateboarding")],
  Snowboard: ["speed", "#00ff00", icon("snowboarding")], // lime
  Snowshoe: ["pace", "#800080", icon("snowshoes")], // purple
  Soccer: ["pace", "#8a2be2", icon("soccer")],
  StairStepper: ["pace", "", icon("stairs")],
  StandUpPaddling: ["speed", "#800080", icon("sup-paddle")],
  Surfing: ["speed", "#006400", icon("surf")], // darkgreen
  Swim: ["speed", "#00ff7f", icon("swimming")], // springgreen
  Velomobile: ["speed", "", ""],
  VirtualRide: ["speed", "#1e90ff", icon("spinning")], // dodgerblue
  VirtualRun: ["pace", "", icon("treadmill")],
  Walk: ["pace", "#ff00ff", icon("walking")], // fuchsia
  WeightTraining: ["", "", icon("weights")],
  Wheelchair: ["speed", "#2b60de", icon("wheelchair")],
  Windsurf: ["speed", "#4b0082", icon("windsurf")],
  Workout: ["", "#4b0082", icon("activity")],
  Yoga: ["", "", icon("meditate")],
  undefined: ["speed", "", icon("activity")],
} as const

export type ActivityType = keyof typeof atype_specs

const defaultSpec = atype_specs.Workout
export function activity_icon(atype: ActivityType) {
  return atype_specs[atype][2] || atype
}

export function activity_pathcolor(atype: ActivityType) {
  return atype_specs[atype][1] || defaultSpec[1]
}

export function activity_vtype(atype: ActivityType) {
  return atype_specs[atype][0] || defaultSpec[0]
}
