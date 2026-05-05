/**
 * @file src/widgets/custom/Number/index.ts
 * @description Number Widget Definition.
 *
 * Implements a robust number input widget that stores a precise number.
 *
 * @features
 * - **Numeric Storage**: Stores data as a `number` for accuracy and calculations.
 * - **Dynamic Validation**: Schema adapts to `required`, `min`, and `max` settings.
 * - **Native Number Input**: Uses `<input type="number">` for optimal UX and accessibility.
 * - **Database Aggregation**: Supports numeric filtering (e.g., value > 100) and sorting.
 */

// Import components needed for the GuiSchema
// Import components needed for the GuiSchema
// import Input from '@components/system/inputs/input.svelte';
// import Toggles from '@components/system/inputs/toggles.svelte';

import type { FieldInstance } from "@src/content/types";
import { widget_number_description } from "@src/paraglide/messages";
import { createWidget } from "@src/widgets/widget-factory";
import {
  maxValue,
  minValue,
  nullable,
  number,
  pipe,
  type InferInput as ValibotInput,
} from "valibot";
import type { NumberProps } from "./types";

// Helper type for aggregation field parameter
interface AggregationField {
  db_fieldName: string;
  [key: string]: unknown;
}

const validationSchema = (field: FieldInstance) => {
  const min = field.min;
  const max = field.max;

  let schema: any = number("Value must be a number");

  if (typeof min === "number") {
    schema = pipe(schema, minValue(min, `Minimum is ${min}`));
  }
  if (typeof max === "number") {
    schema = pipe(schema, maxValue(max, `Maximum is ${max}`));
  }

  return field.required ? schema : nullable(schema);
};

// Create the widget definition using the factory.
const NumberWidget = createWidget<NumberProps>({
  Name: "Number",
  Icon: "mdi:numeric",
  Description: widget_number_description(),
  inputComponentPath: "/src/widgets/custom/number/input.svelte",
  displayComponentPath: "/src/widgets/custom/number/display.svelte",
  validationSchema,

  // Set widget-specific defaults.
  defaults: {
    step: 1,
    translated: false, // A number is a universal value.
  },

  // GuiSchema allows configuration in the collection builder.
  GuiSchema: {
    label: { widget: "Input", required: true },
    db_fieldName: { widget: "Input", required: false },
    required: { widget: "Toggles", required: false },
    min: { widget: "Input", required: false, helper: "Minimum allowed value." },
    max: { widget: "Input", required: false, helper: "Maximum allowed value." },
    step: { widget: "Input", required: false, helper: "Stepping interval." },
    prefix: { widget: "Input", required: false, helper: "Display prefix (e.g., $)" },
    suffix: { widget: "Input", required: false, helper: "Display suffix (e.g., %)" },
    placeholder: { widget: "Input", required: false },
  },

  // Aggregations perform numeric comparisons.
  aggregations: {
    filters: async ({ field, filter }: { field: AggregationField; filter: string }) => {
      const match: any = {};
      if (filter.startsWith(">")) match.$gt = Number.parseFloat(filter.slice(1));
      else if (filter.startsWith("<")) match.$lt = Number.parseFloat(filter.slice(1));
      else if (filter.startsWith(">=")) match.$gte = Number.parseFloat(filter.slice(2));
      else if (filter.startsWith("<=")) match.$lte = Number.parseFloat(filter.slice(2));
      else match.$eq = Number.parseFloat(filter);

      return [{ $match: { [field.db_fieldName]: match } }];
    },
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

  // GraphQL schema for number
  GraphqlSchema: () => ({
    typeID: "Float", // Use Float for numeric values
    graphql: "", // No custom type definition needed
  }),
});

export default NumberWidget;

// Export helper types.
export type FieldType = ReturnType<typeof NumberWidget>;
export type NumberWidgetData = ValibotInput<ReturnType<typeof validationSchema>>;
