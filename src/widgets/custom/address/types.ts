/**
@file src/widgets/custom/address/types.ts
@description - address widget types
*/

// Components
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import PermissionsSetting from '@components/PermissionsSetting.svelte';

// Auth
import type { Permission } from '@root/src/auth';

/**
 * Defines Address widget Parameters
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
	defaultCountry?: string;
	mapCenter?: {
		lat: number;
		lng: number;
	};
	zoom?: number;
};

/**
 * Defines Address Data Structure
 */
export interface AddressData {
	latitude: string | number;
	longitude: string | number;
	name: string;
	street: string;
	addressLine2?: string; // Optional second address line
	houseNumber: string;
	postalCode: string;
	city: string;
	state?: string; // Optional state/province/region
	country: string;
}

/**
 * Defines Country Data Structure
 */
export interface Country {
	id: number;
	alpha2: string;
	alpha3: string;
	en: string;
	[key: string]: string | number; // For other language codes
}

/**
 * Defines Address GuiSchema
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
	defaultCountry: { widget: Input, required: false },
	mapCenter: {
		widget: Input,
		required: false,
		helper: 'Format: lat,lng (e.g. 51.5074,-0.1278)'
	},
	zoom: { widget: Input, required: false }
};

/**
 * Define Address GraphqlSchema function
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
