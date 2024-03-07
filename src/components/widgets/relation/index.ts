import Relation from './Relation.svelte';

import { getFieldName, getGuiFields } from '@src/utils/utils';
import { type Params, GuiSchema, GraphqlSchema } from './types';
import { getCollections } from '@src/collections';
import widgets from '@src/components/widgets';
import deepmerge from 'deepmerge';

//ParaglideJS
import * as m from '@src/paraglide/messages';

/**
 * Defines Relation widget Parameters
 */
const widget = (params: Params) => {
	// Define the display function
	const display = async ({ data, collection, field, entry, contentLanguage }) => {
		const relative_collection = (await getCollections()).find((c) => c.name == field.relation);
		const relative_field = relative_collection?.fields.find((f) => getFieldName(f) == field.displayPath);
		return data?.[getFieldName(relative_field)]
			? await relative_field?.display({
					data: data[getFieldName(relative_field)],
					collection,
					field: relative_field,
					entry,
					contentLanguage
				})
			: '';
	};
	display.default = true;

	// Define the widget object
	const widget: { type: any; key: 'Relation'; GuiFields: ReturnType<typeof getGuiFields> } = {
		type: Relation,
		key: 'Relation',
		GuiFields: getGuiFields(params, GuiSchema)
	};

	// Define the field object
	const field = {
		// default fields
		display,
		label: params.label,
		db_fieldName: params.db_fieldName,
		translated: params.translated,
		icon: params.icon,
		width: params.width,
		helper: params.helper,

		// extra
		relation: params.relation,
		displayPath: params.displayPath
	};

	// Return the field and widget objects
	return { ...field, widget };
};

// Assign GuiSchema and GraphqlSchema to the widget function
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;

// widget icon and helper text
widget.Icon = 'fluent-mdl2:relationship';
widget.Description = m.widget_relation_description();

// Widget Aggregations:
widget.aggregations = {
	transformations: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		return [
			{
				$addFields: {
					convertedId: { $toObjectId: '$relation' }
				}
			},
			{ $project: { relation: 0 } },
			{ $lookup: { from: field.relation.toLocaleLowerCase(), localField: 'convertedId', foreignField: '_id', as: 'relative_document' } },
			{ $addFields: { relation: { $first: '$relative_document' } } },
			{ $project: { relative_document: 0, convertedId: 0 } }
		];
	},
	filters: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		const relative_collection = (await getCollections()).find((c) => c.name == field.relation);
		const relative_field = relative_collection?.fields.find((f) => getFieldName(f) == field.displayPath);
		const widget = widgets[relative_field.widget.key];
		const new_field = deepmerge(relative_field, { db_fieldName: 'relation.' + getFieldName(relative_field) }); //use db_fieldName since it overrides label.
		return widget?.aggregations?.filters({ field: new_field, filter: info.filter, contentLanguage: info.contentLanguage }) ?? [];
	},
	sorts: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		const relative_collection = (await getCollections()).find((c) => c.name == field.relation);
		const relative_field = relative_collection?.fields.find((f) => getFieldName(f) == field.displayPath);

		// Check if widget exists before accessing its properties
		if (widgets[relative_field.widget.key]) {
			const widget = widgets[relative_field.widget.key];
			const new_field = deepmerge(relative_field, { db_fieldName: 'relation.' + getFieldName(relative_field) });
			return widget?.aggregations?.sorts({ field: new_field, sort: info.sort, contentLanguage: info.contentLanguage }) ?? [];
		} else {
			// Handle the case where widget is undefined (e.g., log an error)
			console.error('Widget for relation field is undefined');
			return [];
		}
	}
} as Aggregations;

// Export FieldType interface and widget function
export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
