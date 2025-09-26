/**
 * @file src/widgets/core/daterange/index.ts
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
import IconifyPicker from '@components/IconifyPicker.svelte';
import PermissionsSetting from '@components/PermissionsSetting.svelte';
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';

import { createWidget } from '@src/widgets/factory';
import { check, isoDate, minLength, object, pipe, string } from 'valibot';

import type { DateRangeProps } from './types';

//ParaglideJS
import * as m from '@src/paraglide/messages';

// Define the validation schema for the `{ start, end }` object.
const DateRangeValidationSchema = object(
	{
		start: pipe(string(), minLength(1, 'Start date is required.'), isoDate()),
		end: pipe(string(), minLength(1, 'End date is required.'), isoDate())
	},
	// Use `check` to add a cross-field validation rule.
	[
		check((data) => new Date(data.start) <= new Date(data.end), {
			message: 'End date must be on or after the start date.'
		})
	]
);

// Create the widget definition using the factory.
const DateRangeWidget = createWidget<DateRangeProps, typeof DateRangeValidationSchema>({
	Name: 'DateRange',
	Icon: 'mdi:calendar-range',
	Description: m.widget_dateRange_description(),

	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/daterange/Input.svelte',
	displayComponentPath: '/src/widgets/core/daterange/Display.svelte',

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
		filters: async ({ field, filter }) => {
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
		sorts: async ({ field, sortDirection }) => ({
			[`${field.db_fieldName}.start`]: sortDirection
		})
	}
});

export default DateRangeWidget;

// Export helper types for use in Svelte components.
export type FieldType = ReturnType<typeof DateRangeWidget>;
export type DateRangeWidgetData = Input<typeof DateRangeValidationSchema>;
