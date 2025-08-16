/**
@file src/widgets/custom/rating/types.ts
@description - rating widget types
*/

import { getPublicSetting } from '@src/stores/globalSettings';

// Components
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import PermissionsSetting from '@components/PermissionsSetting.svelte';

// Auth
import type { Permission } from '@root/src/auth';

/**
 * Defines Rating widget Parameters
 */
export type Params = {
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: unknown;
	required?: boolean;
	// translated?: boolean;
	icon?: string;
	helper?: string;
	width?: number;

	// Permissions
	permissions?: Permission[];

	// Widget Specific parameters
	maxRating?: number;
	color?: string;
	size?: number;
	iconEmpty?: string;
	iconHalf?: string;
	iconFull?: string;
};

/**
 * Defines Rating GuiSchema
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
	maxRating: { widget: Input, required: false },
	color: { widget: Input, required: false },
	size: { widget: Input, required: false },
	iconEmpty: { widget: IconifyPicker, required: false },
	iconHalf: { widget: IconifyPicker, required: false },
	iconFull: { widget: IconifyPicker, required: false }
};

/**
 * Define Rating GraphqlSchema function
 */
export const GraphqlSchema: GraphqlSchema = async ({ label }) => {
	// Use the sanitized field name as the type ID
	const typeID = label;

	// Return an object containing the type name and the GraphQL schema
	const availableLanguages = (await getPublicSetting('AVAILABLE_CONTENT_LANGUAGES')) as string[];
	return {
		typeID: typeID,
		graphql: /* GraphQL */ `
        type ${typeID} {
			${availableLanguages.map((contentLanguage) => `${contentLanguage}: String`).join('\n')}
		}
        `
	};
};
