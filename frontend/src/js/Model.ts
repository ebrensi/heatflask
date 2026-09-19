/*
 * Model -- This module defines the parameters of the Heatflask client
 */
import Geohash from "latlon-geohash"
import type { Live } from "./DataBinding"

/**
 * User parameters are the current user browsing and
 * the user whose activities we are viewing
 */
export type User = {
  id: number
  name: string
  profile: string
  private: boolean
  units?: string
}

/**
 * Query parameters are those that describe the query we make to the
 * backend for activity data. Note that there are two types of query:
 *   (1) stored on the backend and referenced by "key", or
 *   (2) specific to one user
 * Type (1) is more general and is meant to be used for long complex
 *   queries and those involving multiple users.
 *
 */
export type QueryParameters = {
  userid?: number
  type?: "days" | "activities" | "dates" | "ids" | "key"
  key?: string // A lookup representing a query stored on the server
  after?: number // Start date Epoch
  before?: number // End date Epoch
  ids?: string // string representing and Array of activity ids
  quantity?: number // number of days or activities
}
export const DefaultQuery: QueryParameters = {
  type: "activities",
  quantity: 10,
  // type: "ids",
  // ids: "6839876364",
}

/**
 * visual-parameters are those that determine what appears visually
 */
export type VisualParameters = {
  // Map
  center?: { lat: number; lng: number } // map latitude, longitude
  zoom?: number // map zoom level
  geohash?: string // a string representing zoom/center
  baselayer?: string // map background tile group name
  autozoom?: boolean // Whether or not to automatically zoom to include all of the activities after render
  pitch?: number // camera tilt, degrees from straight down
  bearing?: number // camera rotation, degrees clockwise from north
  terrain?: boolean // 3D terrain

  // Animation
  tau?: number // time scale: activity-seconds per real second
  T?: number // s: timestep between successive dots, in activity-seconds
  sz?: number // Dot Size
  alpha?: number // global alpha for all rendering
  pw?: number // path width in px, as an unselected activity draws with
  //             nothing selected; 0 draws no paths at all
  cr?: number // colour rotation in degrees: how far the dot palette is
  //             turned before it is dealt out to the activities
  shadows?: boolean // cast the dots' shadow on the map
  paused?: boolean // start in paused state
}

const DEFAULT_CENTER = { lat: 27.53, lng: 1.58 }
const DEFAULT_ZOOM = 3
const DEFAULT_GEOHASH: string = Geohash.encode(
  DEFAULT_CENTER.lat,
  DEFAULT_CENTER.lng,
  DEFAULT_ZOOM
)
/* The Mapbox token and CARTO key are hardcoded in Env.ts, so any layer
 * would work here. OSM is keyless and uses neither quota. */
const DEFAULT_BASELAYER = "OpenStreetMap.Standard"

export const DefaultVisual: VisualParameters = {
  center: DEFAULT_CENTER,
  zoom: DEFAULT_ZOOM,
  geohash: DEFAULT_GEOHASH,
  baselayer: DEFAULT_BASELAYER,
  autozoom: true,
  pitch: 0,
  bearing: 0,
  terrain: false,
  tau: 30, // time scale: activity-seconds per real second
  T: 60, // s: spacing between dots, in activity-seconds
  sz: 3,
  alpha: 0.8,
  pw: 2,
  cr: 0,
  shadows: true,
  paused: false,
}

/**
 * All the model parameters that we can parse from the URL
 */
export type URLParameters = {
  // Query parameters
  after?: string
  before?: string
  days?: string
  limit?: string
  ids?: string
  key?: string
  userid?: string
  // Visual parameters
  // Map
  zoom?: string
  lat?: string
  lng?: string
  autozoom?: string
  geohash?: string
  baselayer?: string
  pitch?: string
  bearing?: string
  terrain?: string
  // Animation
  tau?: string
  T?: string
  sz?: string
  paused?: string
  pw?: string
  cr?: string
  shadows?: string
  /** Not written any more: "paths=0" in an old link becomes pw=0 */
  paths?: string
  alpha?: string
}

/**
 * Parameterized representation of the current state of this app
 */
export type State = {
  url: Live<URLParameters>
  currentUser: Live<User>
  targetUser: Live<User>
  visual: Live<VisualParameters>
  query: Live<QueryParameters>
}
