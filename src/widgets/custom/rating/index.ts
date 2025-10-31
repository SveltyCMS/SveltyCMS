/**
 * @file src/widgets/custom/rating/index.ts
 * @description Rating Widget Definition.
 *
 * Implements an interactive star rating widget.
 *
 * @features
 * - **Numeric Storage**: Stores the rating as a simple `number`.
 * - **Dynamic Validation**: Schema adapts to the `max` rating setting.
 * - **Configurable GUI**: `GuiSchema` allows for easy setup in the Collection Builder.
 * - **Database Aggregation**: Supports numeric filtering (e.g., rating >= 4) and sorting.
 */

// Import components needed for the GuiSchema
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';

import type { FieldInstance } from '@src/content/types';
import * as m from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/factory';
import { maxValue, minValue, number, optional, pipe, type InferInput as ValibotInput } from 'valibot';
import type { RatingProps } from './types';

// Helper type for aggregation field parameter
type AggregationField = { db_fieldName: string; [key: string]: unknown };

// The validation schema is a function to create rules based on the field config.
const validationSchema = (field: FieldInstance) => {
	// The maximum value is determined by the field's config, defaulting to 5.
	const max = (field.max || 5) as number;

	// Start with a base number schema.
	const schema = pipe(number('Rating must be a number.'), minValue(1, 'A rating is required.'), maxValue(max, `Rating cannot exceed ${max}.`));

	// If the field is not required, wrap the schema to allow it to be undefined.
	return field.required ? schema : optional(schema);
};

// Create the widget definition using the factory.
const RatingWidget = createWidget<RatingProps>({
	Name: 'Rating',
	Icon: 'material-symbols:star-outline',
	Description: m.widget_rating_description(),
	inputComponentPath: '/src/widgets/custom/rating/Input.svelte',
	displayComponentPath: '/src/widgets/custom/rating/Display.svelte',
	validationSchema,

	// Set widget-specific defaults.
	defaults: {
		max: 5,
		iconFull: 'material-symbols:star',
		iconEmpty: 'material-symbols:star-outline',
		translated: false
	},

	// GuiSchema allows configuration in the collection builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		max: { widget: Input, required: false, helper: 'Maximum number of stars.' },
		iconFull: { widget: IconifyPicker, required: false },
		iconEmpty: { widget: IconifyPicker, required: false }
	},

	// Aggregations perform numeric comparisons.
	aggregations: {
		filters: async ({ field, filter }: { field: AggregationField; filter: string }) => [
			{ $match: { [field.db_fieldName]: { $eq: parseInt(filter, 10) } } }
		],
		sorts: async ({ field, sortDirection }: { field: AggregationField; sortDirection: number }) => ({
			[field.db_fieldName]: sortDirection
		})
	},

	// GraphQL schema for rating
	GraphqlSchema: () => ({
		typeID: 'Int', // Use Int for rating values
		graphql: '' // No custom type definition needed
	})
});

export default RatingWidget;

// Export helper types.
export type FieldType = ReturnType<typeof RatingWidget>;
export type RatingWidgetData = ValibotInput<ReturnType<typeof validationSchema>>;
