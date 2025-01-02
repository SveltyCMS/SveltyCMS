/**
@file src/widgets/custom/email/types.ts
@description - email widget types
*/

// Components
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import PermissionsSetting from '@components/PermissionsSetting.svelte';

// Auth
import type { Permission } from '@src/auth/types';

/**
 * Defines Email widget Parameters
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
	permissions?: Permission[];

	// Widget Specific parameters
	placeholder?: string;
};

/**
 * Defines Email GuiSchema
 */
export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	required: { widget: Toggles, required: false },
	// translated: { widget: Toggles, required: false },
	icon: { widget: IconifyPicker, required: false },
	helper: { widget: Input, required: false },
	width: { widget: Input, required: false },

	// Permissions
	permissions: { widget: PermissionsSetting, required: false },

	// Widget Specific parameters
	placeholder: { widget: Input, required: false }
};

/**
 * Define Email GraphqlSchema function
 */
export const GraphqlSchema: GraphqlSchema = ({ label, collection }) => {
	// Create a type name by combining the collection name and label
	const typeName = `${collection.name}_${label}`;

	// Return an object containing the type name and the GraphQL schema
	const schema = {
		typeName,
		graphql: /* GraphQL */ `
		type ${typeName} {
		  en: String
		}
	  `
	};

	return schema;
};