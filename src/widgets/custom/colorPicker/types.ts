/**
@file src/widgets/custom/colorPicker/types.ts
@description - colorPicker widget types
*/

// Components
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import PermissionsSetting from '@components/PermissionsSetting.svelte';

// Auth
import type { Permission } from '@root/src/auth';

/**
 * Defines ColorPicker widget Parameters
 */
export type Params = {
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: unk;
	required?: boolean;
	translated?: boolean;
	icon?: string;
	helper?: string;
	width?: number;

	// Permissions
	permissions?: Permission[];

	// Widget Specific parameters
};

/**
 * Defines ColorPicker GuiSchema
 */
export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	translated: { widget: Toggles, required: false },
	required: { widget: Toggles, required: false },
	icon: { widget: IconifyPicker, required: false },
	width: { widget: Input, required: false },

	// Permissions
	permissions: { widget: PermissionsSetting, required: false }

	// Widget Specific parameters
};

/**
 * Define ColorPicker GraphqlSchema function
 */
export const GraphqlSchema: GraphqlSchema = ({ label }) => {
	// Use the sanitized field name as the type ID
	const typeID = label;

	// Return an object containing the type name and the GraphQL schema
	return {
		typeID: typeID,
		graphql: /* GraphQL */ `
		type ${typeID} {
			en: String
		}
        `
	};
};
