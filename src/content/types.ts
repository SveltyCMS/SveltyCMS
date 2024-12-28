/* 
@file src/content/types.ts
@description - Content Type Definition for Content Manager
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
export type Field =
	| WidgetPlaceholder
	| {
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
			contentLanguage: string;
		}) => Promise<string> | string;
		callback?: (args: { data: Record<string, FieldValue> }) => void;
		modifyRequest?: (args: ModifyRequestParams<(typeof widgets)[WidgetKeys]>) => Promise<object>;
	};

// Collection Registry - defines all available collections
export const CollectionRegistry = {
	ContentManager: 'ContentManager',
	categories: 'categories'
} as const;

// Define the base Schema interface
export interface Schema {
	id: string; // UUID from collection file header
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
	translations?: { languageTag: string; translationName: string }[]; // Optional translations
}




// Category interface
export interface Category {
	id: string; // UUID for Category
	name: string; // Category name
	icon: string; // Category icon
	translations?: { languageTag: string; translationName: string }[];
	collections: Schema[]; // Collections within this category
	subcategories?: Record<string, Category>; // Added subcategories support
}

// Category data interface for configuration
export interface CollectionData {
	id: string; // UUID for Collection
	icon: string; // Collection icon
	name: string; // Collection name
	translations?: { languageTag: string; translationName: string }[];
	isCollection?: boolean; // Flag to identify if this is a collection (.ts file)
	subcategories?: Record<string, CollectionData>; // Nested subcategories
	collections?: Schema[]; // Optional array of collections directly within the category
}

// Processed category data interface for UI usage
export interface ProcessedCollectionData extends CollectionData {
	open: boolean; // Indicates if the category is open in UI
	level: number; // Hierarchy level in nested structure
	collections: Schema[]; // Collections in the category
	subcategories: Record<string, ProcessedCollectionData>; // Nested subcategories after processing
}

// System Content
export interface SystemContent {
	id: string;
	name: string;
	icon: string;
	path: string;
	isCollection?: boolean;
	order?: number;
}

// Collection types
export type CollectionTypes = {};
