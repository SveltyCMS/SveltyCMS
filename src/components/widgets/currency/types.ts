// Stores
import { contentLanguage } from '@stores/store';

// Components
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@components/system/inputs/Input2.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import Permissions from '@src/components/Permissions.svelte';
import type { permissions } from '@src/collections/types';

/**
 * Defines Currency widget Parameters
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
	permissions?: permissions;

	// Widget Specific parameters
	currencyCode: string;
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
};

/**
 * Defines Currency GuiSchema
 */
export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	// widget?: any;
	translated: { widget: Toggles, required: false },
	icon: { widget: IconifyPicker, required: false },
	permissions: { widget: Permissions, required: false },

	// Widget Specific parameters
	currencyCode: { widget: Input, required: false },
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
	width: { widget: Input, required: false }
};

/**
 * Define Currency GraphqlSchema function
 */
export const GraphqlSchema: GraphqlSchema = ({ label, collection }) => {
	// Create a type name by combining the collection name and label
	const typeName = `${collection.name}_${label}`;
	// Initialize an empty string to hold the fields
	let fields = '';
	// Iterate over each language
	for (const lang in contentLanguage) {
		fields += `${lang}: String\n`;
	}

	// Return an object containing the type name and the GraphQL schema
	return {
		typeName,
		graphql: /* GraphQL */ `
        type ${typeName} {
            ${fields}
        }
        `
	};
};
