/**
@file src/components/widgets/relation/index.ts
@description - Relation widget index which exports the widget function

*/

const WIDGET_NAME = 'Relation' as const;

import { getFieldName, getGuiFields } from '@utils/utils';
import { type Params, GuiSchema, GraphqlSchema } from './types';
import type { CollectionContent, CollectionTypes, Schema } from '@src/collections/types';
import { collectionManager } from '@src/collections/CollectionManager';
import widgets, { type ModifyRequestParams } from '@components/widgets';
import deepmerge from 'deepmerge';
import { getCollectionModels } from '@src/databases/db';
// ParaglideJS
import * as m from '@src/paraglide/messages';

/**
 * Defines Relation widget Parameters
 */
const widget = <K extends CollectionContent[T][number], T extends CollectionTypes & keyof CollectionContent>(params: Params<K, T>) => {
	// Define the display function
	const display = async ({ data, collection, field, entry, contentLanguage }) => {
		const { collections } = collectionManager.getCollectionData();
		const relative_collection = collections[field.relation];
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
	const widget = {
		Name: WIDGET_NAME,
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

// Assign Name, GuiSchema and GraphqlSchema to the widget function
widget.Name = WIDGET_NAME;
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;
widget.toString = () => '';

// Widget icon and helper text
widget.Icon = 'fluent-mdl2:relationship';
widget.Description = m.widget_relation_description();

// Widget modifyRequest
widget.modifyRequest = async ({ field, data, user, type, id }: ModifyRequestParams<typeof widget>) => {
	const _data = data.get();

	if (type !== 'GET' || !_data) {
		return;
	}
	const relative_collection = (await getCollectionModels())[field.relation];
	const relative_collection_schema = collectionManager.getCollectionData().collections[field.relation] as Schema;
	const response = (await relative_collection.findById(_data)) as any;
	const result = {};

	for (const key in relative_collection_schema.fields) {
		const _field = relative_collection_schema.fields[key];
		const widget = widgets[_field.widget.Name];
		result[getFieldName(_field)] = response[getFieldName(_field)];
		const fieldData = {
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
			data: fieldData,
			user,
			type,
			id
		});
	}
	data.update(result);
};

// Widget Aggregations:
widget.aggregations = {
	filters: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		const { collections } = collectionManager.getCollectionData();
		const relative_collection = collections[field.relation];
		const relative_field = relative_collection?.fields.find((f) => getFieldName(f) == field.displayPath);
		const widget = widgets[relative_field.widget.Name];
		const new_field = deepmerge(relative_field, {
			db_fieldName: 'relation.' + getFieldName(relative_field)
		});
		return (
			widget?.aggregations?.filters({
				field: new_field,
				filter: info.filter,
				contentLanguage: info.contentLanguage
			}) ?? []
		);
	},

	sorts: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		const { collections } = collectionManager.getCollectionData();
		const relative_collection = collections[field.relation];
		const relative_field = relative_collection?.fields.find((f) => getFieldName(f) == field.displayPath);
		const widget = widgets[relative_field.widget.Name];
		const new_field = deepmerge(relative_field, {
			db_fieldName: 'relation.' + getFieldName(relative_field)
		});
		return (
			widget?.aggregations?.sorts({
				field: new_field,
				sort: info.sort,
				contentLanguage: info.contentLanguage
			}) ?? []
		);
	}
} as Aggregations;

// Export widget function and its type
export type FieldType = ReturnType<typeof widget> & {
	relation: CollectionTypes;
	displayPath: string;
};
export default widget;
