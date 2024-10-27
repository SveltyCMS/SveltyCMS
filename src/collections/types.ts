/* 
@file src/collections/types.ts
@description - Collection Types
*/

import type widgets from '@components/widgets';

// Auth
import type { Permission } from '@src/auth/types';

// Define the base Schema interface
export interface Schema {
	id: number; // Unique ID for collections
	name: CollectionNames; // Optional label that will display instead of name if used
	label?: string; // Optional label that will display instead of name if used
	slug?: string; // Optional Slug for the collection
	icon?: string; // Optional icon
	description?: string; // Optional description for the collection
	strict?: boolean; // Optional strict mode
	revision?: boolean; // Optional revisions
	path?: string; // Optional path for folder-based structure
	order?: number; // Optional order within category
	permissions?: Permission; // Optional permission restrictions
	livePreview?: boolean; // Optional live preview
	status?: 'draft' | 'published' | 'unpublished' | 'scheduled' | 'cloned'; // Optional default status how to create new entries
	links?: Array<keyof CollectionNames>; // Optional links to other collections
	fields: ReturnType<(typeof widgets)[keyof typeof widgets]>[];
}

// Collection content type mapping
export type CollectionContent = {
	imageArray: ['ImageArray'];
	Menu: ['Menu'];
	Media: ['Image'];
	Names: ['First Name', 'Last Name'];
	Posts: ['Email', 'Test', 'Image'];
	Posts2: ['Text', 'Text2', 'Text3'];
	Relation: ['Relation M2M to Posts'];
	WidgetTest: [
		'First',
		'Middle',
		'Last',
		'Full Text option',
		'Email',
		'RemoteVideo',
		'Date',
		'DateTime',
		'Number',
		'Currency',
		'Phone Number',
		'Radio',
		'Checkbox',
		'ColorPicker',
		'Rating',
		'RichText'
	];
};

// Valid collection names
export type CollectionNames = keyof CollectionContent;

// Category interface
export interface Category {
	id: number;
	name: string;
	icon: string;
	order: number;
	collections: Schema[];
}

// Extended category interface for UI
export interface FilteredCategory extends Category {
	open?: boolean;
	level?: number;
}
