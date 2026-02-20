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
import IconifyIconsPicker from '@components/iconify-icons-picker.svelte';
import PermissionsSetting from '@components/permissions-setting.svelte';
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';

import { createWidget } from '@src/widgets/widget-factory';

// Type for aggregation field parameter
interface AggregationField {
	db_fieldName: string;
	[key: string]: unknown;
}

//ParaglideJS
import { widget_dateRange_description } from '@src/paraglide/messages';
import { check, isoDate, minLength, object, pipe, string, type InferInput as ValibotInput } from 'valibot';
import type { DateRangeProps } from './types';

// Define the validation schema for the `{ start, end }` object.
const DateRangeValidationSchema = pipe(
	object({
		start: pipe(string(), minLength(1, 'Start date is required.'), isoDate()),
		end: pipe(string(), minLength(1, 'End date is required.'), isoDate())
	}),
	check((data) => new Date(data.start) <= new Date(data.end), 'End date must be on or after the start date.')
);

// Create the widget definition using the factory.
const DateRangeWidget = createWidget<DateRangeProps>({
	Name: 'DateRange',
	Icon: 'mdi:calendar-range',
	Description: widget_dateRange_description(),

	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/DateRange/Input.svelte',
	displayComponentPath: '/src/widgets/core/DateRange/Display.svelte',

	// Assign the validation schema.
	validationSchema: DateRangeValidationSchema,

	// Set widget-specific defaults.
	defaults: {
		translated: false
	},

	// Pass the GuiSchema directly into the widget's definition.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		icon: { widget: IconifyIconsPicker, required: false },
		helper: { widget: Input, required: false },
		width: { widget: Input, required: false },
		permissions: { widget: PermissionsSetting, required: false }
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
						[`${fieldName}.end`]: { $gte: filterDate }
					}
				}
			];
		},
		// Sorting will be based on the start date of the range.
		sorts: async ({ field, sortDirection }: { field: AggregationField; sortDirection: number }) => ({
			[`${field.db_fieldName}.start`]: sortDirection
		})
	}
});

export default DateRangeWidget;

// Export helper types for use in Svelte components.
export type FieldType = ReturnType<typeof DateRangeWidget>;
export type DateRangeWidgetData = ValibotInput<typeof DateRangeValidationSchema>;
