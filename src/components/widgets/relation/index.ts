import Relation from './Relation.svelte';

import { getFieldName, getGuiFields } from '@src/utils/utils';
import { type Params, GuiSchema, GraphqlSchema } from './types';
import { getCollections } from '@src/collections';
import widgets, { type ModifyRequestParams } from '@src/components/widgets';
import deepmerge from 'deepmerge';

// Auth
import type { User } from '@src/auth/types';

// ParaglideJS
import * as m from '@src/paraglide/messages';

/**
 * Defines Relation widget Parameters
 */
const widget = (params: Params) => {
	// Define the display function
	const display = async ({ data, collection, field, entry, contentLanguage }) => {
		const relative_collection = (await getCollections()).find((c: any) => c.name == field.relation);
		const relative_field = relative_collection?.fields.find((f: any) => getFieldName(f) == field.displayPath);
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
		// translated: params.translated,
		icon: params.icon,
		width: params.width,
		helper: params.helper,

		// permissions
		permissions: params.permissions,

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

widget.modifyRequest = async ({ field, data, user }: ModifyRequestParams<typeof widget>) => {
	const { getCollectionModels } = await import('@src/routes/api/db');
	const relative_collection = (await getCollectionModels())[field.relation];

	return await relative_collection.findById(data);
};

// widget icon and helper text
widget.Icon = 'fluent-mdl2:relationship';
widget.Description = m.widget_relation_description();

// Widget Aggregations:
widget.aggregations = {
	filters: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		const relative_collection = (await getCollections()).find((c: any) => c.name == field.relation);
		const relative_field = relative_collection?.fields.find((f: any) => getFieldName(f) == field.displayPath);
		const widget = widgets[relative_field.widget.key];
		const new_field = deepmerge(relative_field, { db_fieldName: 'relation.' + getFieldName(relative_field) }); //use db_fieldName since it overrides label.
		return widget?.aggregations?.filters({ field: new_field, filter: info.filter, contentLanguage: info.contentLanguage }) ?? [];
	},
	sorts: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		const relative_collection = (await getCollections()).find((c: any) => c.name == field.relation);
		const relative_field = relative_collection?.fields.find((f: any) => getFieldName(f) == field.displayPath);
		const widget = widgets[relative_field.widget.key];
		const new_field = deepmerge(relative_field, { db_fieldName: 'relation.' + getFieldName(relative_field) }); //use db_fieldName since it overrides label.
		return widget?.aggregations?.sorts({ field: new_field, sort: info.sort, contentLanguage: info.contentLanguage }) ?? [];
	}
} as Aggregations;

// Export FieldType interface and widget function
export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
