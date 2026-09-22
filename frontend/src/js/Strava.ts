/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
/** Strava related stuff
 */

import { icon } from "./Icons"
import { t } from "./i18n"

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
 * Keyed by both of Strava's names for what an activity is: ActivityType,
 * which the index stores, and the finer SportType the query filters by.
 * Sports with no icon of their own borrow the nearest one.
 * @see  https://developers.strava.com/docs/reference/#api-models-ActivityType
 * @see  https://developers.strava.com/docs/reference/#api-models-SportType
 */
const atype_specs = {
  AlpineSki: ["speed", "#800080", icon("skiing")],
  BackcountrySki: ["speed", "#800080", icon("xc-ski")],
  Badminton: ["", "", icon("activity")],
  Basketball: ["", "", icon("activity")],
  Canoeing: ["speed", "#fa8080", icon("canoe")],
  Cricket: ["", "", icon("activity")],
  Crossfit: ["", "", icon("crossfit")],
  Dance: ["", "", icon("activity")],
  EBikeRide: ["speed", "#0000cd", icon("motorcycle")], // mediumblue
  Elliptical: ["", "", ""],
  EMountainBikeRide: ["speed", "#0000cd", icon("motorcycle")],
  Golf: ["", "", icon("golf")],
  GravelRide: ["speed", "#2b60de", icon("bicycle")],
  Handcycle: ["speed", "#2b60de", icon("handbike")],
  HighIntensityIntervalTraining: ["", "", icon("kettlebell")],
  Hike: ["pace", "#ff1493", icon("hiking")], // deeppink
  IceSkate: ["speed", "#663399", icon("skating")], // rebeccapurple
  InlineSkate: ["speed", "#8a2be2", icon("inline-skating")], // blueviolet
  Kayaking: ["speed", "#ffa500", icon("kayak")], // orange
  Kitesurf: ["speed", "#00ff00", icon("kitesurf")],
  MountainBikeRide: ["speed", "#2b60de", icon("biking")],
  NordicSki: ["speed", "#800080", icon("skiing-nordic")], // purple
  Padel: ["", "", icon("activity")],
  PhysicalTherapy: ["", "", icon("activity")],
  Pickleball: ["", "", icon("activity")],
  Pilates: ["", "", icon("yoga-alt")],
  Racquetball: ["", "", icon("activity")],
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
  Squash: ["", "", icon("activity")],
  StairStepper: ["pace", "", icon("stairs")],
  StandUpPaddling: ["speed", "#800080", icon("sup-paddle")],
  Surfing: ["speed", "#006400", icon("surf")], // darkgreen
  Swim: ["speed", "#00ff7f", icon("swimming")], // springgreen
  TableTennis: ["", "", icon("activity")],
  Tennis: ["", "", icon("activity")],
  TrailRun: ["pace", "#ff0000", icon("running")],
  Velomobile: ["speed", "", ""],
  VirtualRide: ["speed", "#1e90ff", icon("spinning")], // dodgerblue
  VirtualRow: ["speed", "#fa8072", icon("rowing")],
  VirtualRun: ["pace", "", icon("treadmill")],
  Volleyball: ["", "", icon("activity")],
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

/* Strava keeps adding activity types -- WaterSport, GravelRide, TrailRun and
 * friends postdate this table -- and the backend stores the raw type string
 * for anything missing from its own list, so unknown keys do reach here.
 * Indexing straight into atype_specs threw "Cannot read properties of
 * undefined (reading '1')" and took the whole activity import down with it. */
function spec(atype: ActivityType) {
  return atype_specs[atype] || defaultSpec
}

export function activity_icon(atype: ActivityType) {
  return spec(atype)[2] || atype
}

export function activity_pathcolor(atype: ActivityType) {
  return spec(atype)[1] || defaultSpec[1]
}

export function activity_vtype(atype: ActivityType) {
  return spec(atype)[0] || defaultSpec[0]
}

/**
 * Every sport type Strava has, in its order.
 * @see https://developers.strava.com/swagger/sport_type.json
 */
export const SPORT_TYPES = [
  "AlpineSki",
  "BackcountrySki",
  "Badminton",
  "Basketball",
  "Canoeing",
  "Cricket",
  "Crossfit",
  "Dance",
  "EBikeRide",
  "Elliptical",
  "EMountainBikeRide",
  "Golf",
  "GravelRide",
  "Handcycle",
  "HighIntensityIntervalTraining",
  "Hike",
  "IceSkate",
  "InlineSkate",
  "Kayaking",
  "Kitesurf",
  "MountainBikeRide",
  "NordicSki",
  "Padel",
  "PhysicalTherapy",
  "Pickleball",
  "Pilates",
  "Racquetball",
  "Ride",
  "RockClimbing",
  "RollerSki",
  "Rowing",
  "Run",
  "Sail",
  "Skateboard",
  "Snowboard",
  "Snowshoe",
  "Soccer",
  "Squash",
  "StairStepper",
  "StandUpPaddling",
  "Surfing",
  "Swim",
  "TableTennis",
  "Tennis",
  "TrailRun",
  "Velomobile",
  "VirtualRide",
  "VirtualRow",
  "VirtualRun",
  "Volleyball",
  "Walk",
  "WeightTraining",
  "Wheelchair",
  "Windsurf",
  "Workout",
  "Yoga",
] as const

/**
 * A sport's name in the reader's language. Strava publishes only the
 * identifiers ("TrailRun"), so the names are ours, under sport.* in the
 * catalogs. One we have no name for -- Strava adds them -- is spelled out
 * from its identifier: "WaterSport" reads "Water Sport".
 */
/* The keys, for npm run i18n:check, which cannot see a composed one:
 * sport.AlpineSki sport.BackcountrySki sport.Badminton sport.Basketball
 * sport.Canoeing sport.Cricket sport.Crossfit sport.Dance sport.EBikeRide
 * sport.Elliptical sport.EMountainBikeRide sport.Golf sport.GravelRide
 * sport.Handcycle sport.HighIntensityIntervalTraining sport.Hike
 * sport.IceSkate sport.InlineSkate sport.Kayaking sport.Kitesurf
 * sport.MountainBikeRide sport.NordicSki sport.Padel sport.PhysicalTherapy
 * sport.Pickleball sport.Pilates sport.Racquetball sport.Ride
 * sport.RockClimbing sport.RollerSki sport.Rowing sport.Run sport.Sail
 * sport.Skateboard sport.Snowboard sport.Snowshoe sport.Soccer sport.Squash
 * sport.StairStepper sport.StandUpPaddling sport.Surfing sport.Swim
 * sport.TableTennis sport.Tennis sport.TrailRun sport.Velomobile
 * sport.VirtualRide sport.VirtualRow sport.VirtualRun sport.Volleyball
 * sport.Walk sport.WeightTraining sport.Wheelchair sport.Windsurf
 * sport.Workout sport.Yoga
 */
export function sportName(sport: string): string {
  const key = `sport.${sport}`
  const name = t(key)
  return name === key ? sport.replace(/([a-z])([A-Z])/g, "$1 $2") : name
}

/** A sport's icon, never empty: the generic one for a sport without its own */
export function sport_icon(sport: string) {
  return spec(<ActivityType>sport)[2] || icon("activity")
}
