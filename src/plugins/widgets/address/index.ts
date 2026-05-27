/**
 * @file src/widgets/custom/Address/index.ts
 * @description Address Widget Definition.
 *
 * A comprehensive widget for capturing and displaying structured address data,
 * optionally integrated with an interactive map for geocoding.
 *
 * @features
 * - **Structured Data**: Stores a complete, well-defined address object.
 * - **Configurable GUI**: `GuiSchema` provides a UI for setting widget-specific props.
 * - **Geocoding Support**: Integrates with Mapbox for visual location picking.
 * - **Valibot Schema**: Ensures all parts of the address are correctly formatted.
 */

// Import components needed for the GuiSchema
// import Input from '@components/ui/input.svelte'; // Removed for optimization
// import Toggle from '@components/ui/toggle.svelte'; // Removed for optimization

import type { FieldInstance } from "@src/content/types";
import { widget_address_description } from "@src/paraglide/messages";
import { createWidget } from "@src/widgets/widget-factory";
import {
  minLength,
  nullable,
  number,
  object,
  pipe,
  string,
  type InferInput as ValibotInput,
} from "valibot";
import type { AddressProps } from "./types";

// Base validation schema for the address data object.
const ADDRESS_VALIDATION_SCHEMA = object({
  street: pipe(string(), minLength(1, "Street is required.")),
  houseNumber: string(),
  postalCode: pipe(string(), minLength(1, "Postal code is required.")),
  city: pipe(string(), minLength(1, "City is required.")),
  country: pipe(string(), minLength(2, "Country is required.")),
  latitude: nullable(number()),
  longitude: nullable(number()),
});

const validationSchema = (field: FieldInstance) => {
  const schema: any = ADDRESS_VALIDATION_SCHEMA;
  return field.required ? schema : nullable(schema);
};

// Create the widget definition using the factory.
const AddressWidget = createWidget<AddressProps>({
  Name: "Address",
  Icon: "mdi:home-map-marker",
  Description: widget_address_description(),
  inputComponentPath: "/src/widgets/custom/address/input.svelte",
  displayComponentPath: "/src/widgets/custom/address/display.svelte",
  validationSchema,

  // Define the UI for configuring this widget's properties in the Collection Builder.
  GuiSchema: {
    // Standard fields
    label: { widget: "Input", required: true },
    db_fieldName: { widget: "Input", required: false },
    required: { widget: "Toggles", required: false },

    // Widget-specific fields from AddressProps
    defaultCountry: {
      widget: "Input",
      required: false,
      helper: "Default 2-letter country code (e.g., 'DE', 'US').",
    },
    showMap: { widget: "Toggles", required: false },
    enableGeocoding: { widget: "Toggles", required: false },
    showCoordinates: { widget: "Toggles", required: false },
    mapCenter: {
      widget: "Input",
      required: false,
      helper: "Default map center (e.g., '51.34,6.57').",
    },
    zoom: {
      widget: "Input",
      required: false,
      helper: "Default map zoom level (e.g., 12).",
    },
    hiddenFields: {
      widget: "Input",
      required: false,
      helper: "Comma-separated list of fields to hide (e.g., 'houseNumber').",
    },
  },

  // Set widget-specific defaults.
  defaults: {
    mapCenter: { lat: 51.34, lng: 6.57 },
    zoom: 12,
    defaultCountry: "DE",
    showMap: true,
    enableGeocoding: true,
    showCoordinates: false,
    hiddenFields: [],
    translated: false,
  },

  getTranslatablePaths: (basePath: string) => {
    return [
      `${basePath}.street`,
      `${basePath}.postalCode`,
      `${basePath}.city`,
      `${basePath}.country`,
    ].filter(Boolean);
  },
});

export default AddressWidget;

// Export helper types.
export type FieldType = ReturnType<typeof AddressWidget>;
export type AddressWidgetData = ValibotInput<typeof ADDRESS_VALIDATION_SCHEMA>;
