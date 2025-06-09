/**
@file src/widgets/custom/remoteVideo/types.ts
@description - RemoteVideo widget types
*/

import { publicEnv } from '@root/config/public';

// Components
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import PermissionsSetting from '@components/PermissionsSetting.svelte';

// Auth
import type { Permission } from '@root/src/auth';

/**
 * Defines RemoteVideo widget Parameters
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
};

/**
 * Defines RemoteVideo GuiSchema
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
	readonly: { widget: Toggles, required: false }
};

/**
 * Define RemoteVideo GraphqlSchema function
 */
export const GraphqlSchema: GraphqlSchema = ({ label }) => {
	// Use sanitized field name as GraphQL type ID
	const typeID = label;

	// Return an object containing the type name and the GraphQL schema
	return {
		typeID: typeID,
		graphql: /* GraphQL */ `
        type ${typeID} {
			${publicEnv.AVAILABLE_CONTENT_LANGUAGES.map((contentLanguage) => `${contentLanguage}: String`).join('\n')}
		}
        `
	};
};
