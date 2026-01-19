/**
 * @file apps/cms/src/widgets/core/Date/index.ts
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
import IconifyPicker from '@cms/components/IconifyPicker.svelte';
import PermissionsSetting from '@cms/components/PermissionsSetting.svelte';
import Input from '@cms/components/system/inputs/Input.svelte';
import Toggles from '@cms/components/system/inputs/Toggles.svelte';

import { createWidget } from '@widgets/widgetFactory';

// Type for aggregation field parameter
type AggregationField = { db_fieldName: string; [key: string]: unknown };

import { isoDate, minLength, pipe, string, type InferInput as ValibotInput } from 'valibot';

import type { DateProps } from './types';

// ParaglideJS
import * as m from '$lib/paraglide/messages.js';

// Define the validation schema for the data this widget stores.
const DateValidationSchema = pipe(
	string('A value is required.'), // This message shows if the value is not a string
	minLength(1, 'This date is required.'), // This message shows for empty strings
	isoDate('The date must be a valid ISO 8601 string.')
);

// Create the widget definition using the factory.
const DateWidget = createWidget<DateProps>({
	Name: 'Date',
	Icon: 'mdi:calendar',
	Description: m.widget_date_description(),

	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/Date/Input.svelte',
	displayComponentPath: '/src/widgets/core/Date/Display.svelte',

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
		permissions: { widget: PermissionsSetting, required: false },
		minDate: { widget: Input, required: false },
		maxDate: { widget: Input, required: false },
		displayFormat: {
			widget: Input,
			required: false,
			placeholder: 'medium (short, medium, long, full)'
		}
	},

	// Define correct database aggregation logic for dates.
	aggregations: {
		/**
		 * Filters entries based on a date or date range.
		 * Expects filter string format: "YYYY-MM-DD" or "YYYY-MM-DD_YYYY-MM-DD"
		 */
		filters: async ({ field, filter }: { field: AggregationField; filter: string }) => {
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
		sorts: async ({ field, sortDirection }: { field: AggregationField; sortDirection: number }) => ({
			[field.db_fieldName]: sortDirection
		})
	},

	// GraphQL schema for date
	GraphqlSchema: () => ({
		typeID: 'String', // ISO 8601 date string
		graphql: '' // No custom type definition needed
	})
});

export default DateWidget;

// Export helper types for use in Svelte components
export type FieldType = ReturnType<typeof DateWidget>;
export type DateWidgetData = ValibotInput<typeof DateValidationSchema>;
