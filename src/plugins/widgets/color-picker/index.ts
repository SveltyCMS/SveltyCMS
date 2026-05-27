/**
 * @file src/widgets/custom/ColorPicker/index.ts
 * @description ColorPicker Widget Definition.
 *
 * Implements an intuitive color picker using the Three Pillars Architecture.
 * Stores a standard 6-digit hex color code as a string.
 *
 * @features
 * - **Simple Data Contract**: Stores a single, clean hex color string (e.g., '#FFFFFF').
 * - **Robust Validation**: Valibot schema ensures the value is a valid hex code.
 * - **Configurable GUI**: `GuiSchema` allows easy configuration in the Collection Builder.
 * - **Native Color Picker**: Uses the browser's native color input for a good UX.
 */

// Import components needed for the GuiSchema
// Import components needed for the GuiSchema
// import Input from '@components/ui/input.svelte';
// import Toggle from '@components/ui/toggle.svelte';

import type { FieldInstance } from "@src/content/types";
import { widget_colorPicker_description } from "@src/paraglide/messages";
import { createWidget } from "@src/widgets/widget-factory";
import { minLength, optional, pipe, regex, string, type InferInput as ValibotInput } from "valibot";
import type { ColorPickerProps } from "./types";

// The validation schema is a function to accommodate the `required` flag.
const validationSchema = (field: FieldInstance) => {
  const hexSchema = pipe(
    string(),
    regex(/^#[0-9a-f]{6}$/i, "Must be a valid 6-digit hex code (e.g., #FF5733)"),
  );

  const base = field.required
    ? pipe(string(), minLength(1, "A color is required."))
    : optional(string(), "#000000");

  return pipe(base, hexSchema);
};

// Create the widget definition using the factory.
const ColorPickerWidget = createWidget<ColorPickerProps>({
  Name: "ColorPicker",
  Icon: "ic:outline-colorize",
  Description: widget_colorPicker_description(),
  inputComponentPath: "/src/widgets/custom/color-picker/input.svelte",
  displayComponentPath: "/src/widgets/custom/color-picker/display.svelte",
  validationSchema,

  // Set widget-specific defaults.
  defaults: {
    defaultColor: "#000000",
    translated: false,
  },

  // Define the UI for configuring this widget in the Collection Builder.
  GuiSchema: {
    label: { widget: "Input", required: true },
    db_fieldName: { widget: "Input", required: false },
    required: { widget: "Toggles", required: false },
    defaultColor: {
      widget: "Input",
      required: false,
      helper: "Default hex color (e.g., #3B82F6)",
    },
  },
});

export default ColorPickerWidget;

// Export helper types.
export type FieldType = ReturnType<typeof ColorPickerWidget>;
export type ColorPickerWidgetData = ValibotInput<ReturnType<typeof validationSchema>>;
