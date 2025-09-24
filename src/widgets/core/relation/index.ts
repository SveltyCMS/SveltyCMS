/**
 * @file src/widgets/core/relation/index.ts
 * @description Relation (One-to-One) Widget Definition.
 *
 * Implements a one-to-one relationship selector. Stores a single string ID
 * referencing an entry in another collection.
 *
 * @features
 * - **Relational Data**: Stores a single foreign key (ID).
 * - **Configurable GUI**: `GuiSchema` provides an intuitive UI for the collection builder.
 * - **Modal-Based UX**: Designed to work with a selection modal for a clean UX.
 * - **Advanced Aggregation**: Performs a `$lookup` to filter/sort by the related entry's data.
 */

// Import components needed for the GuiSchema
import IconifyPicker from '@components/IconifyPicker.svelte';
import PermissionsSetting from '@components/PermissionsSetting.svelte';
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
// You will need to create these two simple components for your collection builder UI
import CollectionPicker from '@components/system/builder/CollectionPicker.svelte';
import FieldPicker from '@components/system/builder/FieldPicker.svelte';

import type { FieldInstance } from '@src/content/types';
import * as m from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/factory';
import { minLength, optional, pipe, string, type Input as ValibotInput } from 'valibot';
import type { RelationProps } from './types';

// The validation schema ensures the value is a string ID.
const validationSchema = (field: FieldInstance) => {
	const idSchema = pipe(string(), minLength(1, 'An entry must be selected.'));
	return field.required ? idSchema : optional(idSchema, '');
};

// Create the widget definition using the factory.
const RelationWidget = createWidget<RelationProps, ReturnType<typeof validationSchema>>({
	Name: 'Relation',
	Icon: 'mdi:relation-one-to-one',
	Description: m.widget_relation_description(),
	inputComponentPath: '/src/widgets/core/relation/Input.svelte',
	displayComponentPath: '/src/widgets/core/relation/Display.svelte',
	validationSchema,

	// Define the UI for configuring this widget in the Collection Builder.
	GuiSchema: {
		// Standard fields
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		icon: { widget: IconifyPicker, required: false },
		helper: { widget: Input, required: false },
		width: { widget: Input, required: false },
		permissions: { widget: PermissionsSetting, required: false },

		// Widget-specific fields
		collection: {
			widget: CollectionPicker, // A dropdown to select a collection
			required: true
		},
		displayField: {
			widget: FieldPicker, // A dropdown to select a field from the chosen collection
			required: true
		}
	},

	defaults: {
		translated: false
	},
	// Aggregation performs a lookup to search by the related entry's displayField.
	aggregations: {
		filters: async ({ field, filter }) => [
			{ $lookup: { from: field.collection, localField: field.db_fieldName, foreignField: '_id', as: 'related_doc' } },
			{ $match: { [`related_doc.${field.displayField}`]: { $regex: filter, $options: 'i' } } }
		]
	}
});

export default RelationWidget;

// Export helper types.
export type FieldType = ReturnType<typeof RelationWidget>;
export type RelationWidgetData = ValibotInput<ReturnType<typeof validationSchema>>;
