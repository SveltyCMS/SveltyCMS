/**
 * @file src/widgets/custom/Rating/index.ts
 * @description Rating Widget Definition.
 *
 * Implements an interactive star rating widget.
 *
 * @features
 * - **Numeric Storage**: Stores the rating as a simple `number`.
 * - **Dynamic Validation**: Schema adapts to the `max` rating setting.
 * - **Configurable GUI**: `GuiSchema` allows for easy setup in the Collection Builder.
 * - **Database Aggregation**: Supports numeric filtering (e.g., rating >= 4) and sorting.
 */

// Import components needed for the GuiSchema
// Import components needed for the GuiSchema
// import IconifyIconsPicker from '@components/iconify-icons-picker.svelte';
// import Input from '@components/ui/input.svelte';
// import Toggle from '@components/ui/toggle.svelte';

import type { FieldInstance } from "@src/content/types";
import { widget_rating_description } from "@src/paraglide/messages";
import { createWidget } from "@src/widgets/widget-factory";
import {
  maxValue,
  minValue,
  nullable,
  number,
  pipe,
  type InferInput as ValibotInput,
} from "valibot";
import type { RatingProps } from "./types";

// Helper type for aggregation field parameter
interface AggregationField {
  db_fieldName: string;
  [key: string]: unknown;
}

// The validation schema is a function to create rules based on the field config.
const validationSchema = (field: FieldInstance) => {
  const max = Math.max(1, Number(field.max) || 5);
  const min = field.required ? 1 : 0;
  const message = field.required ? "A rating is required." : "Rating cannot be negative.";

  const schema = pipe(
    number("Rating must be a number."),
    minValue(min, message),
    maxValue(max, `Rating cannot exceed ${max}.`),
  );

  return field.required ? schema : nullable(schema);
};

// Create the widget definition using the factory.
const RatingWidget = createWidget<RatingProps>({
  Name: "Rating",
  Icon: "material-symbols:star-outline",
  Description: widget_rating_description(),
  inputComponentPath: "/src/widgets/custom/rating/input.svelte",
  displayComponentPath: "/src/widgets/custom/rating/display.svelte",
  validationSchema,

  // Set widget-specific defaults.
  defaults: {
    max: 5,
    step: 1,
    showValue: true,
    iconFull: "material-symbols:star",
    iconHalf: "material-symbols:star-half",
    iconEmpty: "material-symbols:star-outline",
    translated: false,
  },

  // GuiSchema allows configuration in the collection builder.
  GuiSchema: {
    label: { widget: "Input", required: true },
    db_fieldName: { widget: "Input", required: false },
    required: { widget: "Toggles", required: false },
    max: {
      widget: "Input",
      required: false,
      helper: "Maximum number of stars.",
    },
    step: {
      widget: "Select",
      required: false,
      options: [1, 0.5],
      helper: "Rating step (1 or 0.5 for half stars).",
    },
    showValue: { widget: "Toggles", required: false },
    iconFull: { widget: "IconifyIconsPicker", required: false },
    iconHalf: { widget: "IconifyIconsPicker", required: false },
    iconEmpty: { widget: "IconifyIconsPicker", required: false },
  },

  // Aggregations perform numeric comparisons.
  aggregations: {
    filters: async ({ field, filter }: { field: AggregationField; filter: string }) => [
      {
        $match: { [field.db_fieldName]: { $eq: Number.parseInt(filter, 10) } },
      },
    ],
    sorts: async ({
      field,
      sortDirection,
    }: {
      field: AggregationField;
      sortDirection: number;
    }) => ({
      [field.db_fieldName]: sortDirection,
    }),
  },

  // GraphQL schema for rating
  GraphqlSchema: () => ({
    typeID: "Int", // Use Int for rating values
    graphql: "", // No custom type definition needed
  }),
});

export default RatingWidget;

// Export helper types.
export type FieldType = ReturnType<typeof RatingWidget>;
export type RatingWidgetData = ValibotInput<ReturnType<typeof validationSchema>>;
