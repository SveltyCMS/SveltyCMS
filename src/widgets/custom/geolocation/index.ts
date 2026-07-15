/**
 * @file src/widgets/custom/geolocation/index.ts
 * @description Geolocation Widget - GeoJSON compatible point selector.
 */

import { createWidget } from "@src/widgets/widget-factory";

import { literal, nullable, number, object, tuple, type InferInput as ValibotInput } from "valibot";
import type { GeolocationProps } from "./types";
import type { FieldInstance } from "@src/content/types";

// ✅ SSOT: Validation Schema (GeoJSON Point)
export const createValidationSchema = (field: FieldInstance & GeolocationProps) => {
  const schema = object({
    type: literal("Point"),
    coordinates: tuple([number(), number()]),
  });

  return field.required ? schema : nullable(schema);
};

const GeolocationWidget = createWidget<GeolocationProps>({
  Name: "Geolocation",
  Icon: "mdi:map-marker-radius",
  Description: "GeoJSON Point selector for spatial data and maps.",
  inputComponentPath: "/src/widgets/custom/geolocation/input.svelte",
  displayComponentPath: "/src/widgets/custom/geolocation/display.svelte",

  validationSchema: createValidationSchema,

  defaults: {
    defaultLat: 0,
    defaultLng: 0,
    zoom: 12,
    provider: "osm",
  },

  GuiSchema: {
    label: { widget: "Input", required: true },
    defaultLat: { widget: "Input", type: "number", label: "Default Latitude" },
    defaultLng: { widget: "Input", type: "number", label: "Default Longitude" },
    zoom: { widget: "Input", type: "number", label: "Default Zoom" },
    required: { widget: "Toggles" },
  },

  aggregations: {
    /**
     * Geospatial query: Find entries within a certain radius (meters)
     * Filter format: "lng,lat,radius"
     */
    filters: async ({ field, filter }: { field: FieldInstance; filter: string }) => {
      const [lng, lat, radius] = filter.split(",").map(Number);
      if (isNaN(lng) || isNaN(lat) || isNaN(radius)) return [];

      return [
        {
          $match: {
            [field.db_fieldName]: {
              $near: {
                $geometry: { type: "Point", coordinates: [lng, lat] },
                $maxDistance: radius,
              },
            },
          },
        },
      ];
    },
    sorts: async ({ field, sortDirection }: { field: FieldInstance; sortDirection: number }) => ({
      [field.db_fieldName]: sortDirection,
    }),
  },

  GraphqlSchema: ({ label }) => ({
    typeID: `${label}_GeoPoint`,
    graphql: `
      type ${label}_GeoPoint {
        type: String
        coordinates: [Float]
      }
    `,
  }),

  modifyRequest: async ({ data, type }: any) => {
    if (type === "POST" || type === "PATCH") {
      if (import.meta.env.SSR) {
        const { checkExtensionLicense } = await import("@src/utils/license-manager");
        const status = await checkExtensionLicense("widget", "geolocation");
        if (!status.active && !status.hasLicense) {
          throw new Error("403 Forbidden: Premium License Required for Geolocation Widget");
        }
      }
    }
    return data;
  },
});

export default GeolocationWidget;
export type FieldType = ReturnType<typeof GeolocationWidget>;
export type GeolocationWidgetData = ValibotInput<ReturnType<typeof createValidationSchema>>;
