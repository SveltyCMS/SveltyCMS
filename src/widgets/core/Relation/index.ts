/**
 * @file src/widgets/core/Relation/index.ts
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
// Import components needed for the GuiSchema
// import IconifyIconsPicker from '@components/IconifyIconsPicker.svelte';
// import PermissionsSetting from '@components/PermissionsSetting.svelte';
// import CollectionPicker from '@components/system/builder/CollectionPicker.svelte';
// import FieldPicker from '@components/system/builder/FieldPicker.svelte';
// import Input from '@components/system/inputs/Input.svelte';
// import Toggles from '@components/system/inputs/Toggles.svelte';

import type { FieldInstance } from '@src/content/types';
import * as m from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/widgetFactory';

// Type for aggregation field parameter
type AggregationField = { db_fieldName: string; collection: string; displayField: string; [key: string]: unknown };

import { array, minLength, maxLength, optional, pipe, string, type InferInput as ValibotInput } from 'valibot';
import type { RelationProps } from './types';

// The validation schema ensures the value is a string ID or array of IDs.
const validationSchema = (field: FieldInstance) => {
	if (field.multiple) {
		let arraySchema: any = array(string());
		if (field.min) arraySchema = pipe(arraySchema, minLength(field.min as number, `Select at least ${field.min} entries.`));
		if (field.max) arraySchema = pipe(arraySchema, maxLength(field.max as number, `Select at most ${field.max} entries.`));
		return (field.required ? pipe(arraySchema, minLength(1, 'At least one entry is required.')) : optional(arraySchema)) as any;
	}

	const idSchema = pipe(string(), minLength(1, 'An entry must be selected.'));
	return (field.required ? idSchema : optional(idSchema, '')) as any;
};

// Create the widget definition using the factory.
const RelationWidget = createWidget<RelationProps>({
	Name: 'Relation',
	Icon: 'mdi:relation-one-to-one',
	Description: m.widget_relation_description(),
	inputComponentPath: '/src/widgets/core/Relation/Input.svelte',
	displayComponentPath: '/src/widgets/core/Relation/Display.svelte',
	validationSchema,

	// Define the UI for configuring this widget in the Collection Builder.
	GuiSchema: {
		// Standard fields
		label: { widget: 'Input', required: true },
		db_fieldName: { widget: 'Input', required: false },
		required: { widget: 'Toggles', required: false },
		icon: { widget: 'IconifyIconsPicker', required: false },
		helper: { widget: 'Input', required: false },
		width: { widget: 'Input', required: false },
		permissions: { widget: 'PermissionsSetting', required: false },

		// Widget-specific fields
		collection: {
			widget: 'CollectionPicker',
			required: true
		},
		displayField: {
			widget: 'FieldPicker',
			required: true
		},
		multiple: {
			widget: 'Toggles',
			label: 'Allow Multiple',
			required: false
		},
		min: {
			widget: 'Input',
			type: 'number',
			label: 'Min Items',
			required: false
			// hidden: (data) => !data.multiple
		},
		max: {
			widget: 'Input',
			type: 'number',
			label: 'Max Items',
			required: false
			// hidden: (data) => !data.multiple
		}
	},

	defaults: {
		translated: false,
		multiple: false
	},
	// Aggregation performs a lookup to search by the related entry's displayField.
	// SECURITY: Includes tenant isolation to prevent IDOR attacks
	aggregations: {
		filters: async ({ field, filter, tenantId }: { field: AggregationField; filter: string; tenantId?: string }) => [
			{ $lookup: { from: field.collection, localField: field.db_fieldName, foreignField: '_id', as: 'related_doc' } },
			{
				$match: {
					...(tenantId ? { 'related_doc.tenantId': tenantId } : {}),
					[`related_doc.${field.displayField}`]: { $regex: filter, $options: 'i' }
				}
			}
		],
		sorts: async ({ field, sortDirection }: { field: AggregationField; sortDirection: number }) => {
			// SECURITY: Tenant-aware sorting
			return {
				[`${field.db_fieldName}.${field.displayField}`]: sortDirection
			};
		}
	},

	// GraphQL schema for relation (returns ID of related document)
	GraphqlSchema: ({ field }) => ({
		typeID: (field as RelationProps).multiple ? '[String]' : 'String',
		graphql: ''
	})
});

export default RelationWidget;

// Export helper types.
export type FieldType = ReturnType<typeof RelationWidget>;
export type RelationWidgetData = ValibotInput<ReturnType<typeof validationSchema>>;
