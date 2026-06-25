/**
 * @file src/widgets/custom/Currency/index.ts
 * @description Currency Widget Definition.
 *
 * Implements a robust currency input widget that stores a precise number
 * while displaying and accepting localized, formatted currency strings.
 *
 * @features
 * - **Numeric Storage**: Stores currency as a `number` for accuracy.
 * - **Dynamic Validation**: Schema adapts to `required`, `minValue`, and `maxValue` settings.
 * - **Internationalization**: Uses `Intl.NumberFormat` for locale-aware formatting.
 * - **Configurable GUI**: `GuiSchema` allows easy setup in the Collection Builder.
 * - **Database Aggregation**: Supports numeric filtering (e.g., price > 100) and sorting.
 */

// Import components needed for the GuiSchema
// Import components needed for the GuiSchema
// import Input from '@components/ui/input.svelte';
// import Toggle from '@components/ui/toggle.svelte';

import type { FieldInstance } from "@src/content/types";
import { widget_currency_description } from "@src/paraglide/messages";
import { createWidget } from "@src/widgets/widget-factory";
import {
  maxValue,
  minValue,
  nullable,
  number,
  pipe,
  type InferInput as ValibotInput,
} from "valibot";
import type { CurrencyProps } from "./types";

// Helper type for aggregation field
interface AggregationField {
  db_fieldName: string;
  [key: string]: unknown;
}

const validationSchema = (field: FieldInstance) => {
  const min = field.minValue ?? (field as any).min;
  const max = field.maxValue ?? (field as any).max;

  let schema: any = number("Value must be a number.");

  if (typeof min === "number") {
    schema = pipe(schema, minValue(min, `Value must be at least ${min}`));
  }
  if (typeof max === "number") {
    schema = pipe(schema, maxValue(max, `Value must not exceed ${max}`));
  }

  return field.required ? schema : nullable(schema);
};

// Create the widget definition using the factory.
const CurrencyWidget = createWidget<CurrencyProps>({
  Name: "Currency",
  Icon: "mdi:currency-usd",
  Description: widget_currency_description(),
  inputComponentPath: "/src/widgets/custom/currency/input.svelte",
  displayComponentPath: "/src/widgets/custom/currency/display.svelte",
  validationSchema,

  // Set widget-specific defaults.
  defaults: {
    currencyCode: "EUR",
    translated: false, // A monetary value is typically not translated.
  },

  // SECURITY: Validate ISO 4217 currency codes
  // validCurrencyCodes: ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD', 'SEK', 'NOK', 'NZD', 'KRW', 'TRY', 'INR', 'BRL', 'ZAR'],

  // GuiSchema allows configuration in the collection builder.
  GuiSchema: {
    label: { widget: "Input", required: true },
    db_fieldName: { widget: "Input", required: false },
    required: { widget: "Toggles", required: false },
    currencyCode: {
      widget: "Input",
      required: true,
      helper: "ISO 4217 code (USD, EUR, GBP, etc.)",
      pattern: "^[A-Z]{3}$",
    },
    minValue: { widget: "Input", required: false },
    maxValue: { widget: "Input", required: false },
    step: {
      widget: "Input",
      required: false,
      helper: "Step value (e.g., 0.01)",
    },
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

  // GraphQL schema for currency
  GraphqlSchema: () => ({
    typeID: "Float", // Use Float for currency values
    graphql: "", // No custom type definition needed
  }),
});

export default CurrencyWidget;

// Export helper types.
export type FieldType = ReturnType<typeof CurrencyWidget>;
export type CurrencyWidgetData = ValibotInput<ReturnType<typeof validationSchema>>;
