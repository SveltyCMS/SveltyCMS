/**
@file src/widgets/core/input/types.ts
@description - Input widget types
*/

import { publicEnv } from '@root/config/public';
import { toStringHelper } from '@utils/utils';

// Components
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import PermissionsSetting from '@components/PermissionsSetting.svelte';

// Auth
import type { Permission } from '@root/src/auth';

/**
 * Defines Text widget Parameters
 */
export type Params = {
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: unknown;
	required?: boolean;
	translated?: boolean;
	icon?: string;
	helper?: string;
	width?: number;

	// Permissions
	permissions?: Permission[];

	// Widget Specific parameters
	placeholder?: string;
	count?: number;
	minlength?: number;
	maxlength?: number;
	prefix?: string;
	suffix?: string;
	readonly?: boolean;
	disabled?: boolean;
};

/**
 * Defines Text GuiSchema
 */
export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	required: { widget: Toggles, required: false },
	translated: { widget: Toggles, required: false },
	icon: { widget: IconifyPicker, required: false },
	helper: { widget: Input, required: false },
	width: { widget: Input, required: false },

	// Permissions
	permissions: { widget: PermissionsSetting, required: false },

	// Widget Specific parameters
	placeholder: { widget: Input, required: false },
	count: { widget: Input, required: false },
	minlength: { widget: Input, required: false },
	maxlength: { widget: Input, required: false },
	prefix: { widget: Input, required: false },
	suffix: { widget: Input, required: false },
	readonly: { widget: Toggles, required: false },
	disabled: { widget: Toggles, required: false }
};

/**
 * Define Text GraphqlSchema function
 */
export const GraphqlSchema: GraphqlSchema = ({ label }) => {
	// Use the sanitized field name as the type ID
	const typeID = label;

	const graphqlFields = publicEnv.AVAILABLE_CONTENT_LANGUAGES.map((contentLanguage) => `${contentLanguage}: String`).join('\n');

	// Return an object containing the type name and the GraphQL schema
	const schema = {
		typeID,
		graphql: /* GraphQL */ `
		type ${typeID} {
		  ${graphqlFields}
		}
	  `
	};

	return schema;
};

// HTML Text to string
export function toString({ field, data }: { field: unknown; data: unknown }) {
	return toStringHelper({
		field,
		data,
		path: (lang) => {
			return data[lang];
		}
	});
}
