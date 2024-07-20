import type widgets from '@components/widgets';

// Auth
import type { Permission } from '@src/auth/types';

// Define a new `Schema` interface that represents the shape of an object with several properties
export interface Schema {
	name: string; // Make `name` non-optional
	slug?: string;
	links?: CollectionNames[];
	icon?: string;
	description?: string;
	status?: 'draft' | 'published' | 'unpublished' | 'schedule' | 'cloned';
	permissions?: Permission;
	fields: ReturnType<(typeof widgets)[keyof typeof widgets]>[];
	strict?: boolean;
	revision?: boolean; // Make revisions optional
}

// Define a new `CollectionNames` type that represents the shape of an object with several properties


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
export type CollectionNames = 'ImageArray'|'Media'|'Menu'|'Names'|'Posts'|'Relation'|'WidgetTest';