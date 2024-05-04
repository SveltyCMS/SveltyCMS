const WIDGET_NAME = 'FileUpload' as const;

import { getFieldName, getGuiFields, get_elements_by_id } from '@utils/utils';
import { type Params, GuiSchema, GraphqlSchema } from './types';
import type { ModifyRequestParams } from '..';
import mongoose from 'mongoose';

//ParaglideJS
import * as m from '@src/paraglide/messages';

/**
 * Defines FileUpload widget Parameters
 */
const widget = (params: Params) => {
	// Define the display function
	let display: any;

	if (!params.display) {
		display = async ({ data }) => {
			//console.log(data);

			// Return the formatted doctype as Icon
			if (data?.fileExtension) {
				const fileExt = data.fileExtension;
				let icon: any;
				if (fileExt === '.docx') {
					icon = 'vscode-icons:file-type-word';
				} else if (fileExt === '.xlsx') {
					icon = 'vscode-icons:file-type-excel';
				} else if (fileExt === '.pptx') {
					icon = 'vscode-icons:file-type-powerpoint';
				} else if (fileExt === '.pdf') {
					icon = 'vscode-icons:file-type-pdf2';
				}

				if (icon) {
					return `<iconify-icon icon="${icon}" width="30" />`;
				}
			}

			return m.widgets_nodata();
		};
		display.default = true;
	}

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
		translated: params.translated,
		required: params.required,
		icon: params.icon,
		width: params.width,
		helper: params.helper,

		// permissions
		permissions: params.permissions,

		// extras
		path: params.path || 'unique'
	};

	// Return the field and widget objects
	return { ...field, widget };
};

// Assign Name, GuiSchema and GraphqlSchema to the widget function
widget.Name = WIDGET_NAME;
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;

// Widget icon and helper text
widget.Icon = 'mdi:file-upload';
widget.Description = m.widget_fileUpload_description();

// Widget modifyRequest
widget.modifyRequest = async ({ data, type }: ModifyRequestParams<typeof widget>) => {
	const _data = data.get();
	if (type !== 'GET') {
		if (_data._id) {
			console.log(_data);
			data.update(new mongoose.Types.ObjectId(_data._id));
		} else {
			console.error('No _id found in _data:', _data);
		}
		return;
	}
	// here _data is just id of the image
	get_elements_by_id.add('media_files', _data, (newData) => data.update(newData));
};

// Widget Aggregations:
widget.aggregations = {
	filters: async (info) => {
		const field = info.field as ReturnType<typeof widget>;

		return [{ $match: { [`${getFieldName(field)}.original.name`]: { $regex: info.filter, $options: 'i' } } }];
	},
	sorts: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		const fieldName = getFieldName(field);
		return [{ $sort: { [`${fieldName}.original.name`]: info.sort } }];
	}
} as Aggregations;

// Export FieldType interface and widget function
export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
