// Components
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@src/components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import Permissions from '@src/components/Permissions.svelte';

// Auth
import type { permissions } from '@src/auth/types';

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
	permissions?: permissions;

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
	permissions: { widget: Permissions, required: false },

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
	return {
		typeName,
		graphql: /* GraphQL */ `
		type ${typeName} {
			en: String
		}
        `
	};
};
