/* 
@file src/collections/types.ts
@description - Collection Types
*/

import type widgets from '@components/widgets';

// Auth
import type { Permission } from '@src/auth/types';

// Define a new `Schema` interface that represents the shape of an object with several properties
export interface Schema {
	label?: string; // optional label that will display instead of name if used
	slug?: string; // Optional Slug for the collection
	links?: CollectionNames[]; // optional links for the collection
	icon?: string; // optional icon for the collection
	description?: string; // optional description for the collection
	status?: 'draft' | 'published' | 'unpublished' | 'schedule' | 'cloned';
	permissions?: Permission; // optional permission restrictions
	fields: ReturnType<(typeof widgets)[keyof typeof widgets]>[]; // array of fields
	strict?: boolean; // optional strict mode
	revision?: boolean; // optional revisions
	livePreview?: boolean; // optional  live preview
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
