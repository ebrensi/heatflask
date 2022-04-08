/**
 * Some declarations to keep TypeScript from complaining about
 *  Parcel URL schemes
 */

declare module "bundle-text:*" {
  const value: string
  export default value
}

declare module "url:*" {
  const value: string
  export default value
}
