/**
 * @file apps/cms/src/widgets/core/Daterange/index.ts
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
import IconifyPicker from '@cms/components/IconifyPicker.svelte';
import PermissionsSetting from '@cms/components/PermissionsSetting.svelte';
import Input from '@cms/components/system/inputs/Input.svelte';
import Toggles from '@cms/components/system/inputs/Toggles.svelte';

import { createWidget } from '@widgets/widgetFactory';

// Type for aggregation field parameter
type AggregationField = { db_fieldName: string; [key: string]: unknown };

import { check, isoDate, minLength, object, pipe, string, type InferInput as ValibotInput } from 'valibot';

import type { DateRangeProps } from './types';

//ParaglideJS
import * as m from '$paraglide/messages.js';

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
	Description: m.widget_dateRange_description(),

	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/Daterange/Input.svelte',
	displayComponentPath: '/src/widgets/core/Daterange/Display.svelte',

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
		icon: { widget: IconifyPicker, required: false },
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
			if (isNaN(filterDate.getTime())) return [];

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
