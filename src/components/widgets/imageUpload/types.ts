// Components
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@src/components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import Permission from '@src/components/Permission.svelte';

// Auth
import type { Permissions } from '@src/auth/types';

import { SIZES } from '@utils/utils';

/**
 * Defines ImageUpload widget Parameters
 */

enum WATERMARK_POSITION {
	'top-left' = 'top-left',
	'top-center' = 'top-center',
	'top-right' = 'top-right',
	'center-left' = 'center-left',
	'center' = 'center',
	'center-right' = 'center-right',
	'bottom-left' = 'bottom-left',
	'bottom-center' = 'bottom-center',
	'bottom-right' = 'bottom-right'
}

export type Params = {
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: any;
	required?: boolean;
	translated?: boolean;
	icon?: string;
	helper?: string;
	width?: number;

	// Permissions
	permissions?: Permissions;

	// Widget Specific parameters
	path: string | 'global' | 'unique';
	type?: string | 'image' | 'audio' | 'video' | 'document' | 'remotevideo';
	multiupload?: boolean;
	sizelimit?: number;
	extensions?: string;
	watermark?: {
		url: string; // URL of the watermark image
		position?: WATERMARK_POSITION; // Optional position (defaults to center)
		opacity?: number; // Opacity between 0 and 1 (defaults to 1)
		scale?: number; // Scale watermark size as a percentage (defaults to 100)
		offsetX?: number; // Offset watermark position in pixels (horizontal)
		offsetY?: number; // Offset watermark position in pixels (vertical)
	};
};

/**
 * Defines ImageUpload GuiSchema
 */
export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	required: { widget: Toggles, required: false },
	translated: { widget: Toggles, required: false },
	icon: { widget: IconifyPicker, required: false },
	width: { widget: Input, required: false },

	// Permissions
	permissions: { widget: Permission, required: false },

	// Widget Specific parameters
	path: { widget: Input, required: false },
	multiupload: { widget: Input, required: true },
	watermark: { widget: Input, required: true }
};

// Create a type name by combining the collection name and label
const types = Object.keys(SIZES)
	.map(
		(size) =>
			`type ${size} {
	name: String
	url: String
	size: Int
	type: String
	lastModified: Float
}`
	)
	.join('\n');

/**
 * Define ImageUpload GraphqlSchema function
 */
export const GraphqlSchema: GraphqlSchema = ({ label, collection }) => {
	// Create a type name by combining the collection name and label
	const typeName = `${collection.name}_${label}`;
	console.log(typeName);
	// Return an object containing the type name and the GraphQL schema
	return {
		typeName,
		graphql: /* GraphQL */ `
        ${types}
		type ${typeName} {
			${Object.keys(SIZES)
				.map((size) => `${size}: ${size}`)
				.join('\n')}
		}
	`
	};
};
