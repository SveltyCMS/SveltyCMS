import { publicEnv } from '@root/config/public';

// Components
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@components/system/inputs/Input2.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import Permissions from '@src/components/Permissions.svelte';
import type { permissions } from '@src/collections/types';

/**
 * Defines Number widget Parameters
 */
export type Params = {
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: any;
	translated?: boolean;
	icon?: string;
	helper?: string;
	width?: number;

	// Permissions
	permissions?: permissions;

	// Widget Specific parameters
	placeholder?: string;
	count?: number;
	minlength?: number;
	maxlength?: number;
	step?: number;
	negative?: boolean;
	prefix?: string;
	suffix?: string;
	required?: boolean;
	readonly?: boolean;
	currencyCode?: string;
};

/**
 * Defines Number GuiSchema
 */
export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	translated: { widget: Toggles, required: false },
	icon: { widget: IconifyPicker, required: false },
	width: { widget: Input, required: false },

	// Permissions
	permissions: { widget: Permissions, required: false },

	// Widget Specific parameters
	placeholder: { widget: Input, required: false },
	count: { widget: Input, required: false },
	minlength: { widget: Input, required: false },
	maxlength: { widget: Input, required: false },
	step: { widget: Input, required: false },
	negative: { widget: Toggles, required: false },
	prefix: { widget: Input, required: false },
	suffix: { widget: Input, required: false },
	required: { widget: Toggles, required: false },
	readonly: { widget: Toggles, required: false },
	currencyCode: { widget: Input, required: false }
};

/**
 * Define Number GraphqlSchema function
 */
export const GraphqlSchema: GraphqlSchema = ({ label, collection }) => {
	// Create a type name by combining the collection name and label
	const typeName = `${collection.name}_${label}`;

	// Return an object containing the type name and the GraphQL schema
	return {
		typeName,
		graphql: /* GraphQL */ `
        type ${typeName} {
			${publicEnv.AVAILABLE_CONTENT_LANGUAGES.map((contentLanguage) => `${contentLanguage}: String`).join('\n')}
		}
        `
	};
};
