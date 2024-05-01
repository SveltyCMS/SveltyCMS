import Relation from './Relation.svelte';

import { getFieldName, getGuiFields } from '@src/utils/utils';
import { type Params, GuiSchema, GraphqlSchema } from './types';
import type { CollectionLabels, Schema } from '@src/collections/types';
import { getCollections } from '@src/collections';
import widgets, { type ModifyRequestParams } from '@src/components/widgets';
import deepmerge from 'deepmerge';

// ParaglideJS
import * as m from '@src/paraglide/messages';

/**
 * Defines Relation widget Parameters
 */
const widget = <K extends T, T extends CollectionLabels>(params: Params<K, T>) => {
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
		required: params.required,
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

// widget modifyRequest
widget.modifyRequest = async ({ field, data, user, type, id }: ModifyRequestParams<typeof widget>) => {
	const _data = data.get();
	if (type !== 'GET' || !_data) {
		return;
	}
	const { getCollectionModels } = await import('@src/routes/api/db');
	const relative_collection = (await getCollectionModels())[field.relation];
	const relative_collection_schema = (await getCollections()).find((c) => c.name == field.relation) as Schema;
	const response = (await relative_collection.findById(_data)) as any;
	const result = {};
	for (const key in relative_collection_schema.fields) {
		const _field = relative_collection_schema.fields[key];
		const widget = widgets[_field.widget.key];
		const data = {
			get() {
				return response[getFieldName(_field)];
			},
			update(newData) {
				result[getFieldName(_field)] = newData;
			}
		};
		await widget.modifyRequest({
			collection: relative_collection,
			field: _field as ReturnType<typeof widget>,
			data,
			user,
			type,
			id
		});
	}
	data.update(result);
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
