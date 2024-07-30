// Components
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@src/components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import PermissionsSetting from '@src/components/PermissionsSetting.svelte';

// Auth
import type { Permission } from '@src/auth/types';

import { SIZES } from '@utils/utils';

/**
 * Defines MediaUpload widget Parameters
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
	permissions?: Permission[];

	// Widget Specific parameters
	folder: string | 'global' | 'unique';
	type?: string | 'image' | 'audio' | 'video' | 'document' | 'remotevideo';
	allowedtypes?: string[];
	multiupload?: boolean; // Ensure this is included for multi-file uploads
	sizelimit?: number;
	extensions?: string;
	metadata?: Record<string, any>;
	tags?: string[];
	categories?: string[];
	responsive?: boolean;
	customDisplayComponent?: any;
	watermark?: {
		url: string; // URL of the watermark image
		position?: WATERMARK_POSITION; // Optional position (defaults to center)
		opacity?: number; // Opacity between 0 and 1 (defaults to 1)
		scale?: number; // Scale watermark size as a percentage (defaults to 100)
		offsetX?: number; // Offset watermark position in pixels (horizontal)
		offsetY?: number; // Offset watermark position in pixels (vertical)
		rotation?: number; // Rotate watermark in degrees
	};
};

/**
 * Defines MediaUpload GuiSchema
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
	permissions: { widget: PermissionsSetting, required: false },

	// Widget Specific parameters
	folder: { widget: Input, required: false },
	multiupload: { widget: Toggles, required: true },
	sizelimit: { widget: Input, required: true },
	extensions: { widget: Input, required: false },
	metadata: { widget: Input, required: false },
	tags: { widget: Input, required: false },
	categories: { widget: Input, required: false },
	responsive: { widget: Toggles, required: false },
	customDisplayComponent: { widget: Input, required: false },
	watermark: {
		widget: {
			url: { widget: Input, required: true },
			position: { widget: Input, required: true },
			opacity: { widget: Input, required: true },
			scale: { widget: Input, required: false },
			offsetX: { widget: Input, required: false },
			offsetY: { widget: Input, required: false },
			rotation: { widget: Input, required: false }
		},
		required: false
	}
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
 * Define MediaUpload GraphqlSchema function
 */
export const GraphqlSchema = ({ label, collection }: { label: string; collection: string }) => {
	// Create a type name by combining the collection name and label
	const typeDefs = `
    type ${label} {
        id: ID!
        name: String
        ${types}
        permissions: [Permission]
        watermark: Watermark
    }

    type Permission {
        id: ID!
        name: String
    }

    type Watermark {
        url: String
        position: WATERMARK_POSITION
        opacity: Float
        scale: Float
        offsetX: Float
        offsetY: Float
        rotation: Float
    }

    type Query {
        ${collection}: [${label}]
    }

    type Mutation {
        create${label}(input: Create${label}Input): ${label}
        update${label}(id: ID!, input: Update${label}Input): ${label}
        delete${label}(id: ID!): Boolean
    }

    input Create${label}Input {
        name: String
        ${Object.keys(GuiSchema)
					.map((field) => `${field}: ${getType(GuiSchema[field].widget)}`)
					.join('\n')}
    }

    input Update${label}Input {
        name: String
        ${Object.keys(GuiSchema)
					.map((field) => `${field}: ${getType(GuiSchema[field].widget)}`)
					.join('\n')}
    }
    `;

	return typeDefs;
};

const getType = (widget: any): string => {
	switch (widget) {
		case Input:
			return 'String';
		case Toggles:
			return 'Boolean';
		case IconifyPicker:
			return 'String';
		case PermissionsSetting:
			return '[Permission]';
		default:
			return 'String';
	}
};
