/**
 * @file src/widgets/custom/phonenumber/index.ts
 * @description PhoneNumber Widget Definition.
 *
 * Implements a robust phone number input that stores a simple string.
 *
 * @features
 * - **Dynamic Validation**: Uses a custom `pattern` if provided, otherwise defaults to E.164 international format.
 * - **Semantic HTML**: The input component uses `<input type="tel">` for accessibility.
 * - **Actionable Display**: The display component renders a clickable `tel:` link.
 * - **Configurable GUI**: `GuiSchema` allows for easy setup in the Collection Builder.
 */

// Import components needed for the GuiSchema
// Import components needed for the GuiSchema
// import Input from '@components/system/inputs/input.svelte';
// import Toggles from '@components/system/inputs/toggles.svelte';

import type { FieldInstance } from "@src/content/types";
import { widget_phoneNumber_description } from "@src/paraglide/messages";
import { createWidget } from "@src/widgets/widget-factory";
import { nullable, pipe, regex, string, type InferInput as ValibotInput } from "valibot";
import type { PhoneNumberProps } from "./types";

// SECURITY: More robust phone validation
// E.164 format: +[country code][subscriber number]
// Country code: 1-3 digits, Subscriber: up to 15 total digits
const validationSchema = (field: FieldInstance) => {
  const defaultPattern = /^\+?[1-9]\d{1,14}$/;
  const pattern = field.pattern ? new RegExp(field.pattern as string) : defaultPattern;
  const message = "Please enter a valid phone number (e.g., +49123456789)";

  const base = pipe(string(), regex(pattern, message));

  return field.required ? base : nullable(base);
};

// Create the widget definition using the factory.
const PhoneNumberWidget = createWidget<PhoneNumberProps>({
  Name: "PhoneNumber",
  Icon: "ic:baseline-phone-in-talk",
  Description: widget_phoneNumber_description(),
  inputComponentPath: "/src/widgets/custom/phone-number/input.svelte",
  displayComponentPath: "/src/widgets/custom/phone-number/display.svelte",
  validationSchema,

  // Set widget-specific defaults.
  defaults: {
    translated: false, // A phone number should not be translatable.
  },

  // Define the UI for configuring this widget in the Collection Builder.
  GuiSchema: {
    label: { widget: "Input", required: true },
    db_fieldName: { widget: "Input", required: false },
    required: { widget: "Toggles", required: false },
    placeholder: { widget: "Input", required: false },
    pattern: {
      widget: "Input",
      required: false,
      helper: "Optional: Custom regex for validation.",
    },
  },
});

export default PhoneNumberWidget;

// Export helper types.
export type FieldType = ReturnType<typeof PhoneNumberWidget>;
export type PhoneNumberWidgetData = ValibotInput<ReturnType<typeof validationSchema>>;
