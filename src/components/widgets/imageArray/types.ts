/**
@file src/components/widgets/imageArray/types.ts
@description - imageArray widget types
*/

// Components
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import PermissionsSetting from '@components/PermissionsSetting.svelte';

// Auth
import type { Permission } from '@src/auth/types';

import { getFieldName } from '@utils/utils';

// Display function type
export type DISPLAY = ({
	data,
	collection,
	field,
	entry,
	contentLanguage
}: {
	data: any;
	collection: any;
	field: any;
	entry: any;
	contentLanguage: string;
}) => Promise<string>;

/**
 * Widget interface for type safety
 */
export interface IWidget {
	Name: string;
	modifyRequest?: ModifyRequestFn;
	GraphqlSchema?: (args: { label: string; collection: string }) => { graphql: string };
}

/**
 * ModifyRequest type for widget
 */
export type ModifyRequestFn = (args: { collection: any; field: any; data: any; user: any; type: string; id?: string }) => Promise<void>;

/**
 * Defines ImageArray widget Parameters
 */
export type Params = {
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: any;
	required?: boolean;
	icon?: string;
	helper?: string;
	width?: number;

	// Permissions
	permissions?: Permission[];

	// Widget Specific parameters
	fields: Array<{
		widget: IWidget;
		[key: string]: any;
	}>;
	uploader_label: string;
	uploader_display?: DISPLAY;
	uploader_db_fieldName?: string;
	uploader_path: string;
};

/**
 * GraphQL Schema type
 */
type GraphqlSchema = (params: { field: any; collection: string }) => {
	typeName: string | null;
	graphql: string;
};

/**
 * Defines ImageArray GuiSchema
 */
export const GuiSchema = {
	// default required parameters
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	required: { widget: Toggles, required: false },
	icon: { widget: IconifyPicker, required: false },
	width: { widget: Input, required: false },

	// Permissions
	permissions: { widget: PermissionsSetting, required: false },

	// Widget Specific parameters
	uploader_path: { widget: Input, required: true },
	uploader_label: { widget: Input, required: true }
};

/**
 * Define ImageArray GraphqlSchema function
 */
export const GraphqlSchema: GraphqlSchema = ({ field, collection }) => {
	let fieldTypes = '';
	for (const _field of field.fields) {
		if (_field.widget?.GraphqlSchema) {
			fieldTypes +=
				_field.widget.GraphqlSchema({
					label: getFieldName(_field, true),
					collection
				}).graphql + '\n';
		}
	}

	return {
		typeName: null, // imageArray does not have its own typeName in DB so its null. it unpacks fieldTypes directly
		graphql: /* GraphQL */ `
			${fieldTypes}
		`
	};
};
