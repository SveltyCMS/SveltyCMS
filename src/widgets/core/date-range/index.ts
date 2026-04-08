/**
 * @file src/widgets/core/Daterange/index.ts
 * @description DateRange Widget Definition.
 *
 * Implements a robust date range widget using the Three Pillars Architecture.
 * Stores a start and end date object in ISO 8601 UTC format.
 *
 * @features
 * - **Complex Object Storage**: Manages a `{ start, end }` data structure.
 * - **Advanced Validation**: Uses Valibot `refine` to ensure end date is after start date.
 * - **Timezone Consistency**: Stores all dates in UTC to prevent timezone bugs.
 * - **Database Aggregation**: Powerful filter to find entries where a date falls within the range.
 * - **Native Date Pickers**: Uses two native date inputs for a lightweight and accessible UX.
 */

// Components needed for the GuiSchema
import IconifyIconsPicker from "@components/iconify-icons-picker.svelte";
import PermissionsSetting from "@components/permissions-setting.svelte";
import Input from "@components/system/inputs/input.svelte";
import Toggles from "@components/system/inputs/toggles.svelte";

import { createWidget } from "@src/widgets/widget-factory";

// Type for aggregation field parameter
interface AggregationField {
  db_fieldName: string;
  [key: string]: unknown;
}

//ParaglideJS
import {
  check,
  isoTimestamp,
  minLength,
  object,
  pipe,
  string,
  type InferInput as ValibotInput,
} from "valibot";
import type { DateRangeProps } from "./types";

// Define the validation schema for the `{ start, end }` object.
const DATE_RANGE_VALIDATION_SCHEMA = pipe(
  object({
    start: pipe(string(), minLength(1, "Start date is required."), isoTimestamp()),
    end: pipe(string(), minLength(1, "End date is required."), isoTimestamp()),
  }),
  check(
    (data) => new Date(data.start) <= new Date(data.end),
    "End date must be on or after the start date.",
  ),
);

// Create the widget definition using the factory.
const DateRangeWidget = createWidget<DateRangeProps>({
  Name: "DateRange",
  Icon: "mdi:calendar-range",
  Description: "A widget for selecting a date range with start and end dates.",

  // Define paths to the dedicated Svelte components.
  inputComponent: () => import("./input.svelte"),
  inputComponentPath: "/src/widgets/core/date-range/input.svelte",
  displayComponent: () => import("./display.svelte"),
  displayComponentPath: "/src/widgets/core/date-range/display.svelte",

  // Assign the validation schema.
  validationSchema: DATE_RANGE_VALIDATION_SCHEMA,

  // Set widget-specific defaults.
  defaults: {
    translated: false,
  },

  // Pass the GuiSchema directly into the widget's definition.
  GuiSchema: {
    label: { widget: Input, required: true },
    db_fieldName: { widget: Input, required: false },
    required: { widget: Toggles, required: false },
    icon: { widget: IconifyIconsPicker, required: false },
    helper: { widget: Input, required: false },
    width: { widget: Input, required: false },
    permissions: { widget: PermissionsSetting, required: false },
  },

  // Define database aggregation logic for date ranges.
  aggregations: {
    /**
     * Filters for entries where the provided date falls within the entry's date range.
     * Expects filter string format: "YYYY-MM-DD"
     */
    filters: async ({ field, filter }: { field: AggregationField; filter: string }) => {
      const fieldName = field.db_fieldName;
      const filterDate = new Date(filter);
      if (Number.isNaN(filterDate.getTime())) {
        return [];
      }

      // Find documents where the filterDate is between the start and end fields.
      return [
        {
          $match: {
            [`${fieldName}.start`]: { $lte: filterDate },
            [`${fieldName}.end`]: { $gte: filterDate },
          },
        },
      ];
    },
    // Sorting will be based on the start date of the range.
    sorts: async ({
      field,
      sortDirection,
    }: {
      field: AggregationField;
      sortDirection: number;
    }) => ({
      [`${field.db_fieldName}.start`]: sortDirection,
    }),
  },
});

export default DateRangeWidget;

// Export helper types for use in Svelte components.
export type FieldType = ReturnType<typeof DateRangeWidget>;
export type DateRangeWidgetData = ValibotInput<typeof DATE_RANGE_VALIDATION_SCHEMA>;
