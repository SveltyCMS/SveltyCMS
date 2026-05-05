/**
 * @file src/widgets/custom/geolocation/types.ts
 * @description Types for the Geolocation widget.
 */

import type { FieldConfig } from "@src/widgets/types";

export interface GeoPoint {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
}

export interface GeolocationProps extends FieldConfig {
  defaultLat?: number;
  defaultLng?: number;
  zoom?: number;
  provider?: "google" | "leaflet" | "osm";
}
