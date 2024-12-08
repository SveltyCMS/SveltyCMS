/* 
@file src/collections/types.ts
@description - Collection Type Definition for Collection Manager
*/

import type widgets from '@components/widgets';
import type { ModifyRequestParams } from '@components/widgets';

// Auth
import type { RolePermissions } from '@src/auth/types';

// Widget placeholder type
export interface WidgetPlaceholder {
	__widgetName: string;
	__widgetConfig: Record<string, unknown>;
	__isWidgetPlaceholder: true;
}

// Collection names are dynamic, based on the files in the collections directory

// Widget field type definition
type WidgetKeys = keyof typeof widgets;
type WidgetTypes = (typeof widgets)[WidgetKeys];

// Field value types
export type FieldValue = string | number | boolean | null | Record<string, unknown> | Array<unknown>;

// Extended field type with display and callback properties
export type Field = WidgetPlaceholder | {
	widget: WidgetTypes;
	type: WidgetKeys;
	config: WidgetTypes;
	label: string;
	required?: boolean;
	unique?: boolean;
	default?: FieldValue;
	validate?: (value: FieldValue) => boolean | Promise<boolean>;
	display?: (args: {
		data: Record<string, FieldValue>;
		collection: string;
		field: Field;
		entry: Record<string, FieldValue>;
		contentLanguage: string
	}) => Promise<string> | string;
	callback?: (args: { data: Record<string, FieldValue> }) => void;
	modifyRequest?: (args: ModifyRequestParams<(typeof widgets)[WidgetKeys]>) => Promise<object>;
};

// Collection Registry - defines all available collections
export const CollectionRegistry = {
	CollectionManager: 'CollectionManager',
	categories: 'categories'
} as const;

// Define the base Schema interface
export interface Schema {
	id: string;  // Changed from number to string to support UUIDs
	name?: CollectionTypes | string; // Collection name can be from registry or dynamic
	label?: string; // Optional label that will display instead of name if used
	slug?: string; // Optional Slug for the collection
	icon?: string; // Optional icon
	description?: string; // Optional description for the collection
	strict?: boolean; // Optional strict mode
	revision?: boolean; // Optional revisions
	path?: string; // Path within the collections folder structure
	permissions?: RolePermissions; // Optional permission restrictions
	livePreview?: boolean; // Optional live preview
	status?: 'draft' | 'published' | 'unpublished' | 'scheduled' | 'cloned'; // Optional default status
	links?: Array<CollectionTypes>; // Optional links to other collections
	fields: Field[]; // Collection fields
}

// Collection content type mapping
export type CollectionContent = {
	[key: string]: string[]; // Dynamic mapping of collection names to their content types
};

// Category interface
export interface Category {
	id: string;  // Changed from number to string
	name: string;
	icon: string;
	collections: Schema[]; // Collections within this category
	subcategories?: Record<string, Category>; // Added subcategories support
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
	subcategories?: Record<string, CategoryData>; // Nested subcategories
	collections?: Schema[]; // Optional array of collections directly within the category
}

// Processed category data interface for UI usage
export interface ProcessedCategoryData extends CategoryData {
	open: boolean; // Indicates if the category is open in UI
	level: number; // Hierarchy level in nested structure
	collections: Schema[]; // Collections in the category
	subcategories: Record<string, ProcessedCategoryData>; // Nested subcategories after processing
}

// Collection types
export type CollectionTypes = 'CollectionManager' | 'categories' | 'collectionTypes';
