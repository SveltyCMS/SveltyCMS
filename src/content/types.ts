/**
 * @file src/content/types.ts
 * @description Content Type Definition for Content Manager
 */

import type { WidgetPlaceholder } from '@src/widgets/types';
import type widgets from '@widgets';
import type { ModifyRequestParams } from '@widgets';

// Auth
import type { RolePermissions } from '@src/auth/types';
import type { ContentNode } from '../databases/dbInterface';

// Widget field type definition
export type WidgetKeys = keyof typeof widgets;
export type WidgetTypes = (typeof widgets)[WidgetKeys];

// Field value types
export type FieldValue = string | number | boolean | null | Record<string, unknown> | Array<unknown>;

// Extended field definition
export interface Field {
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
	modifyRequest?: (args: ModifyRequestParams) => Promise<object>;
}

// Field definition
export type FieldDefinition = Field | WidgetPlaceholder;

// Collection Registry - defines all available collections
export const CollectionRegistry = {
	ContentManager: 'ContentManager',
	categories: 'categories'
} as const;

// Define the Translation Schema
export interface Translation {
	languageTag: string;
	translationName: string;
	isDefault?: boolean;
}

export interface Schema {
	_id: string; // UUID from collection file header
	name?: ContentTypes | string; // Collection name can be from registry or dynamic
	label?: string; // Optional label that will display instead of name if used
	slug?: string; // Optional Slug for the collection
	icon?: string; // Optional icon
	order?: number; // Optional display order
	description?: string; // Optional description for the collection
	strict?: boolean; // Optional strict mode
	revision?: boolean; // Optional revisions
	revisionLimit?: number; // Optional: Maximum number of revisions to keep
	path?: string; // Path within the collections folder structure
	permissions?: RolePermissions; // Optional permission restrictions
	livePreview?: boolean; // Optional live preview
	status?: 'draft' | 'published' | 'unpublished' | 'scheduled' | 'cloned'; // Optional default status
	links?: Array<ContentTypes>; // Optional links to other collections
	fields: FieldDefinition[]; // Collection fields
	translations?: Translation[]; // Optional translations with enhanced metadata
}

export type MinimalContentNode = {
	name: string;
	path: string;
	nodeType: 'category';
};

export type ContentNodeOperatianType = 'create' | 'delete' | 'move' | 'rename' | 'update';

export type ContentNodeOperation = {
	type: ContentNodeOperatianType;
	node: ContentNode;
};

// Category interface for representing the folder structure
export interface Category {
	_id: string; // UUID for Category
	name: string; // Category name, derived from folder name
	path: string; // Path within the structure, derived from folder path
	icon?: string; // Optional icon for the category
	order?: number; // Optional display order
	nodeType: 'category' | 'collection';
	parentPath?: string | null;
	translations?: { languageTag: string; translationName: string }[]; // Optional translations for the category name
	collectionConfig?: Record<string, unknown>; // Optional collection configuration
}

// Collection data interface for configuration
export interface CollectionData {
	_id: string; // UUID for Collection
	icon?: string; // Optional collection icon
	name: string; // Collection name
	label?: string; // Optional display label
	order?: number; // Optional display order
	path: string; // Collection path
	translations?: { languageTag: string; translationName: string }[]; // Optional translations
	permissions?: RolePermissions; // Optional permissions
	livePreview?: boolean; // Optional live preview
	strict?: boolean; // Optional strict mode
	revision?: boolean; // Optional revisions
	fields: FieldDefinition[]; // Collection fields
	description?: string; // Optional description
	slug?: string; // Optional slug
	status?: 'draft' | 'published' | 'unpublished' | 'scheduled' | 'cloned'; // Optional status
	links?: Array<ContentTypes>; // Optional links to other collections
}

// Collection types for collections registry
export type ContentTypes = keyof typeof CollectionRegistry;
