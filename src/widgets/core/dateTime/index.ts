/**
 * @file src/widgets/core/datetime/index.ts
 * @description DateTime Widget Definition.
 *
 * Implements the DateTime widget using the Three Pillars Architecture.
 * Stores datetimes in ISO 8601 UTC format to ensure timezone consistency,
 * while providing a localized, native datetime input experience for the user.
 *
 * @features
 * - **Timezone Normalization**: Converts user's local time to UTC for storage.
 * - **ISO 8601 Storage**: All datetimes stored in standardized UTC format.
 * - **Valibot Validation**: Ensures data is a valid ISO 8601 datetime string.
 * - **Native DateTime Picker**: Uses browser's `datetime-local` input for optimal UX.
 * - **Database Aggregation**: Supports time-aware filtering and sorting.
 * - **Localized Display**: Automatically formats UTC dates into the user's local time.
 * - **Quick Presets**: Convenient buttons for common datetime selections.
 * - **Multiple Display Formats**: Short, medium, long, and full datetime formats.
 * - **Relative Time Context**: Shows temporal relationship to current time.
 */

import { createWidget } from '@src/widgets/factory';
import { isoDateTime, minLength, pipe, string, type InferInput as ValibotInput } from 'valibot';
import type { DateTimeProps } from './types';

// Components needed for the GuiSchema
import IconifyPicker from '@components/IconifyPicker.svelte';
import PermissionsSetting from '@components/PermissionsSetting.svelte';
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';

//ParaglideJS
import * as m from '@src/paraglide/messages';

// Define the validation schema for the data this widget stores.
const DateTimeValidationSchema = pipe(
	string('A value is required.'),
	minLength(1, 'This datetime is required.'),
	isoDateTime('The datetime must be a valid ISO 8601 string.')
);

// Create the widget definition using the factory.
const DateTimeWidget = createWidget<DateTimeProps>({
	Name: 'DateTime',
	Icon: 'mdi:calendar-clock',
	Description: m.widget_DateTime_description(),

	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/datetime/Input.svelte',
	displayComponentPath: '/src/widgets/core/datetime/Display.svelte',

	// Assign the validation schema.
	validationSchema: DateTimeValidationSchema,

	// Set widget-specific defaults.
	defaults: {
		displayFormat: 'medium'
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

	// Define correct database aggregation logic for datetimes.
	aggregations: {
		filters: async ({ field, filter }) => {
			const fieldName = field.db_fieldName;
			const [startDateStr, endDateStr] = filter.split('_');
			const startDate = new Date(startDateStr);
			if (isNaN(startDate.getTime())) return [];

			if (endDateStr) {
				const endDate = new Date(endDateStr);
				if (!isNaN(endDate.getTime())) {
					return [{ $match: { [fieldName]: { $gte: startDate, $lte: endDate } } }];
				}
			}
			// If only one date is provided, filter for that entire day.
			const endOfDay = new Date(startDate);
			endOfDay.setUTCHours(23, 59, 59, 999);
			return [{ $match: { [fieldName]: { $gte: startDate, $lte: endOfDay } } }];
		},
		sorts: async ({ field, sortDirection }) => ({
			[field.db_fieldName]: sortDirection
		})
	}
});

export default DateTimeWidget;

// Export helper types for use in Svelte components.
export type FieldType = ReturnType<typeof DateTimeWidget>;
export type DateTimeWidgetData = ValibotInput<typeof DateTimeValidationSchema>;
