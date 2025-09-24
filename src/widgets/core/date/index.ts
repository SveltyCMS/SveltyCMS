/**
 * @file src/widgets/core/date/index.ts
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

// Components needed for the GuiSchema
import IconifyPicker from '@components/IconifyPicker.svelte';
import PermissionsSetting from '@components/PermissionsSetting.svelte';
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';

import { createWidget } from '@src/widgets/factory';
import { isoDate, minLength, pipe, string } from 'valibot';

import type { DateProps } from './types';

// ParaglideJS
import * as m from '@src/paraglide/messages';

// Define the validation schema for the data this widget stores.
const DateValidationSchema = pipe(
	string('A value is required.'), // This message shows if the value is not a string
	minLength(1, 'This date is required.'), // This message shows for empty strings
	isoDate('The date must be a valid ISO 8601 string.')
);

// Create the widget definition using the factory.
const DateWidget = createWidget<DateProps, typeof DateValidationSchema>({
	Name: 'Date',
	Icon: 'mdi:calendar',
	Description: m.widget_date_description(),

	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/date/Input.svelte',
	displayComponentPath: '/src/widgets/core/date/Display.svelte',

	// Assign the validation schema.
	validationSchema: DateValidationSchema,

	// Set widget-specific defaults. A date is typically not translated.
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

	// Define correct database aggregation logic for dates.
	aggregations: {
		/**
		 * Filters entries based on a date or date range.
		 * Expects filter string format: "YYYY-MM-DD" or "YYYY-MM-DD_YYYY-MM-DD"
		 */
		filters: async ({ field, filter }) => {
			const fieldName = field.db_fieldName;
			const [startDateStr, endDateStr] = filter.split('_');

			const startDate = new Date(startDateStr);
			startDate.setUTCHours(0, 0, 0, 0); // Start of the day

			if (isNaN(startDate.getTime())) return []; // Invalid date

			// Handle date range
			if (endDateStr) {
				const endDate = new Date(endDateStr);
				endDate.setUTCHours(23, 59, 59, 999); // End of the day
				if (!isNaN(endDate.getTime())) {
					return [{ $match: { [fieldName]: { $gte: startDate, $lte: endDate } } }];
				}
			}

			// Handle single day
			const endOfDay = new Date(startDate);
			endOfDay.setUTCHours(23, 59, 59, 999);
			return [{ $match: { [fieldName]: { $gte: startDate, $lte: endOfDay } } }];
		},
		// Sorts entries by the date field.
		sorts: async ({ field, sortDirection }) => ({
			[field.db_fieldName]: sortDirection
		})
	}
});

export default DateWidget;

// Export helper types for use in Svelte components
export type FieldType = ReturnType<typeof DateWidget>;
export type DateWidgetData = Input<typeof DateValidationSchema>;
