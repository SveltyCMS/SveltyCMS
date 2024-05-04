// Components
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@src/components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import Permission from '@src/components/Permission.svelte';

// Auth
import type { Permissions } from '@src/auth/types';

import { getFieldName } from '@utils/utils';
import widgets from '@components/widgets';

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
	// translated?: boolean;
	icon?: string;
	helper?: string;
	width?: number;

	// Permissions
	permissions?: Permissions;

	// Widget Specific parameters
	fields: any;
	uploader_label: string;
	uploader_display?: DISPLAY;
	uploader_db_fieldName?: string;
	uploader_path: string;
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
	// translated: { widget: Toggles, required: false },
	icon: { widget: IconifyPicker, required: false },
	width: { widget: Input, required: false },

	// Permissions
	permissions: { widget: Permission, required: false },

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
		fieldTypes += widgets[_field.widget.Name].GraphqlSchema({ label: getFieldName(_field, true), collection }).graphql + '\n';
	}

	return {
		typeName: null, // imageArray does not have its own typeName in DB so its null. it unpacks fieldTypes directly
		graphql: /* GraphQL */ `
			${fieldTypes}
		`
	};
};
