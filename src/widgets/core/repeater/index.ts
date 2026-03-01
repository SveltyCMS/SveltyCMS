/**
 * @file src/widgets/core/Repeater/index.ts
 * @description Repeater Widget Definition.
 *
 * Allows creating an array of complex objects (rows), where each row
 * adheres to a defined schema of fields.
 *
 * @features
 * - **Nested Schema**: Defines a mini-schema for each item.
 * - **Reorderable**: Supports drag-and-drop reordering.
 * - **Polymorphic**: Can (eventually) support mixed types, but starts with single-schema.
 */

import type { FieldInstance } from '@src/content/types';
import { createWidget } from '@src/widgets/widget-factory';
import { array, maxLength, minLength, object, optional, pipe } from 'valibot';
import type { RepeaterProps } from './types';

// Helper to generate schema for a single row based on defined fields
const validationSchema = (field: FieldInstance) => {
	// Explicitly cast to any to allow valibot piping transformations
	let schema: any = array(object({}));

	if (field.min) {
		schema = pipe(schema, minLength(field.min as number, `Must have at least ${field.min} items.`));
	}
	if (field.max) {
		schema = pipe(schema, maxLength(field.max as number, `Cannot have more than ${field.max} items.`));
	}

	return field.required ? pipe(schema, minLength(1, 'At least one item is required.')) : optional(schema);
};

const RepeaterWidget = createWidget<RepeaterProps>({
	Name: 'Repeater',
	Icon: 'mdi:view-list-outline',
	Description: 'A list of repeatable items',
	inputComponentPath: ' $args[0].Value.ToLower() ',
	displayComponentPath: ' $args[0].Value.ToLower() ',
	validationSchema,

	defaults: {
		fields: [],
		min: 0,
		addLabel: 'Add Item'
	},

	GuiSchema: {
		label: { widget: 'Input', required: true },
		db_fieldName: { widget: 'Input', required: false },
		required: { widget: 'Toggles', required: false },
		min: { widget: 'Input', type: 'number', label: 'Min Items' },
		max: { widget: 'Input', type: 'number', label: 'Max Items' },
		addLabel: { widget: 'Input', label: 'Add Button Label' },
		// Placeholder for Fields builder. In a real app, this would be a specialized "SchemaBuilder" widget.
		// For now, we assume the schema is defined via code (Preset).
		fields: { widget: 'Json', label: 'Field Definitions (JSON)' }
	},

	GraphqlSchema: () => {
		// Repeater returns a JSON string or a custom type if we generate it dynamically.
		// For simplicity in V1, we typically return JSON or separate Type.
		// Given SveltyCMS architecture, returning JSON primitive is safest until deep integration.
		return {
			typeID: '[JSON]',
			graphql: ''
		};
	}
});

export default RepeaterWidget;
export type FieldType = ReturnType<typeof RepeaterWidget>;
