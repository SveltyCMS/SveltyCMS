/**
 * @file src/widgets/custom/Date/index.ts
 * @description Date Widget Definition
 *
 * Implements date widget using the Three Pillars Architecture.
 * Stores dates in ISO 8601 UTC format for consistency across timezones while
 * providing localized display and native HTML date input experience.
 *
 * @features
 * - **ISO 8601 Storage**: All dates stored in standardized UTC format
 * - **Valibot Validation**: Type-safe validation with runtime checking
 * - **Three Pillars Architecture**: Separated Definition/Input/Display components
 * - **Timezone Consistency**: Handles user timezones transparently
 * - **Database Aggregation**: Advanced filtering and sorting for date ranges
 * - **Localized Display**: Automatic formatting based on user's browser locale
 * - **Native Date Picker**: Uses browser's built-in date input for optimal UX
 * - **Error Handling**: Deterministic IDs, proper error handling
 */

import { createWidget } from "@src/widgets/widget-factory";
import { widget_date_description } from "@src/paraglide/messages";
import { isoTimestamp, pipe, string, nullable, type InferInput as ValibotInput } from "valibot";
import type { DateTimeProps } from "./types";
// Type for aggregation field parameter
interface AggregationField {
  db_fieldName: string;
  [key: string]: unknown;
}

// Define the validation schema for the data this widget stores.
const createValidationSchema = (field: DateTimeProps) => {
  const schema = pipe(
    string("A value is required."),
    isoTimestamp("The date must be a valid ISO 8601 string."),
  );

  return field.required ? schema : nullable(schema);
};

// Create the widget definition using the factory.
const DateTimeWidget = createWidget<DateTimeProps>({
  Name: "DateTime",
  Icon: "mdi:calendar-clock",
  Description: widget_date_description(),

  // Define paths to the dedicated Svelte components.
  inputComponentPath: "/src/widgets/core/date-time/input.svelte",
  displayComponentPath: "/src/widgets/core/date-time/display.svelte",

  // Assign the validation schema.
  validationSchema: createValidationSchema,

  // 🚀 NORMALIZATION: Ensure all persisted and returned dates are standardized UTC ISO strings
  modifyRequest: async ({ data }: any) => {
    const val = data.get();
    if (val !== undefined && val !== null && val !== "") {
      const { toISOString } = await import("@src/utils/date");
      const normalized = toISOString(val);
      if (normalized && normalized !== val) {
        data.update(normalized);
      }
    }
    return data;
  },

  // Set widget-specific defaults. A date is typically not translated.
  defaults: {
    translated: false,
  },

  // Pass the GuiSchema directly into the widget's definition.
  GuiSchema: {
    label: { widget: "Input", required: true },
    db_fieldName: { widget: "Input", required: false },
    default: { widget: "Input", required: false },
    required: { widget: "Toggles", required: false },
    icon: { widget: "IconifyIconsPicker", required: false },
    helper: { widget: "Input", required: false },
    width: { widget: "Input", required: false },
    permissions: { widget: "PermissionsSetting", required: false },
    minDate: { widget: "Input", required: false },
    maxDate: { widget: "Input", required: false },
    displayFormat: {
      widget: "Input",
      required: false,
      placeholder: "medium (short, medium, long, full)",
    },
  },

  // Define correct database aggregation logic for dates.
  aggregations: {
    /**
     * Filters entries based on a date or date range.
     * Expects filter string format: "YYYY-MM-DD" or "YYYY-MM-DD_YYYY-MM-DD"
     */
    filters: async ({ field, filter }: { field: AggregationField; filter: string }) => {
      const fieldName = field.db_fieldName;
      const [startDateStr, endDateStr] = filter.split("_");

      const startDate = new Date(startDateStr);
      startDate.setUTCHours(0, 0, 0, 0); // Start of the day

      if (Number.isNaN(startDate.getTime())) {
        return []; // Invalid date
      }

      // Handle date range
      if (endDateStr) {
        const endDate = new Date(endDateStr);
        endDate.setUTCHours(23, 59, 59, 999); // End of the day
        if (!Number.isNaN(endDate.getTime())) {
          return [{ $match: { [fieldName]: { $gte: startDate, $lte: endDate } } }];
        }
      }

      // Handle single day
      const endOfDay = new Date(startDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
      return [{ $match: { [fieldName]: { $gte: startDate, $lte: endOfDay } } }];
    },
    // Sorts entries by the date field.
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

  // GraphQL schema for date
  GraphqlSchema: () => ({
    typeID: "String", // ISO 8601 date string
    graphql: "", // No custom type definition needed
  }),

  jsonRender: true,
});

export default DateTimeWidget;

// 🚀 CRITICAL: Attach modifyRequest to the factory for the server-side pipeline
(DateTimeWidget as any).modifyRequest =
  DateTimeWidget.prototype?.modifyRequest ||
  (async (args: any) => {
    // We need a way to call the instance's modifyRequest or implement it here
    // Since DateTime normalization doesn't depend on instance props (mostly),
    // we can implement a static version or just reuse the logic.
    const { data, type } = args;
    if (type === "GET") return {};

    const val = data.get();
    if (val !== undefined && val !== null && val !== "") {
      const { toISOString } = await import("@src/utils/date");
      const normalized = toISOString(val);
      if (process.env.BENCHMARK_DEBUG === "true") {
        console.info(`[DEBUG] DateTimeWidget Static Normalized: from ${val} to ${normalized}`);
      }
      data.update(normalized);
    }
    return {};
  });

// Export helper types for use in Svelte components
export type FieldType = ReturnType<typeof DateTimeWidget>;
export type DateWidgetData = ValibotInput<ReturnType<typeof createValidationSchema>>;
