/* 
@file src/collections/types.ts
@description - Collection Types
*/

import type widgets from '@components/widgets';

// Auth
import type { Permission } from '@src/auth/types';

// Define a new `Schema` interface that represents the shape of an object with several properties
export interface Schema {
	name?: CollectionNames; // Ensure name matches a key in CollectionNames
	label?: string; // Optional label that will display instead of name if used
	slug?: string; // Optional Slug for the collection
	links?: Array<keyof CollectionNames>; // Ensure links are valid collection names
	icon?: string; // Optional icon for the collection
	description?: string; // Optional description for the collection
	status?: 'draft' | 'published' | 'unpublished' | 'scheduled' | 'cloned';
	permissions?: Permission; // Optional permission restrictions
	fields: ReturnType<(typeof widgets)[keyof typeof widgets]>[]; // Array of fields
	strict?: boolean; // Optional strict mode
	revision?: boolean; // Optional revisions
	livePreview?: boolean; // Optional live preview
}

// Define a new `Collection` interface that represents the shape of an object with several properties
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

export type CollectionNames = 'ImageArray' | 'Media' | 'Menu' | 'Names' | 'Posts' | 'Relation' | 'WidgetTest';
