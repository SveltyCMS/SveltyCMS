/* 
@file src/collections/types.ts
@description - Collection Types
*/

import type widgets from '@components/widgets';
import type { ModifyRequestParams } from '@components/widgets';

// Auth
import type { Permission } from '@src/auth/types';

// Collection names are dynamic, based on the files in the collections directory
export type CollectionNames = string;

// Widget field type definition
type WidgetKeys = keyof typeof widgets;
type WidgetTypes = (typeof widgets)[WidgetKeys];
export type Field = {
	widget(widget: any): unknown;
	type: WidgetKeys;
	config: WidgetTypes;
	modifyRequest?: (args: ModifyRequestParams<(typeof widgets)[WidgetKeys]>) => Promise<object>;
};

// Define the base Schema interface
export interface Schema {
	id: number; // Unique ID for collections
	name: CollectionNames; // Collection name
	label?: string; // Optional label that will display instead of name if used
	slug?: string; // Optional Slug for the collection
	icon?: string; // Optional icon
	description?: string; // Optional description for the collection
	strict?: boolean; // Optional strict mode
	revision?: boolean; // Optional revisions
	path?: string; // Path within the collections folder structure
	permissions?: Permission; // Optional permission restrictions
	livePreview?: boolean; // Optional live preview
	status?: 'draft' | 'published' | 'unpublished' | 'scheduled' | 'cloned'; // Optional default status
	links?: Array<CollectionNames>; // Optional links to other collections
	fields: Field[]; // Collection fields
}

// Collection content type mapping
export type CollectionContent = {
	[key: string]: string[]; // Dynamic mapping of collection names to their content types
};

// Category interface
export interface Category {
	id: number;
	name: string;
	icon: string;

	collections: Schema[];
}

// Extended category interface for UI
export interface FilteredCategory extends Category {
	open?: boolean;
	level?: number;
}

// Category data interface for configuration
export interface CategoryData {
	id: string;
	icon: string;
	name: string;

	isCollection?: boolean; // Flag to identify if this is a collection (.ts file)
	subcategories?: Record<string, CategoryData>;
}
