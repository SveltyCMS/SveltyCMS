/* 
@file src/collections/types.ts
@description - Collection Type Definition for Collection Manager
*/

//import type widgets from '@components/widgets';
//import type { ModifyRequestParams } from '@components/widgets';




export type WidgetFunction = any;
// widgets
export type widgets = Record<string, WidgetFunction>;


export type ModifyRequestParams<T extends (...args: unknown[]) => unknown> = {
  collection: Schema;
  id?: WidgetId;
  field: ReturnType<T>;
  data: { get: () => unknown; update: (newData: unknown) => void };
  user: User;
  type: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  meta_data?: Record<string, unknown>;
};




// Auth
import type { RolePermissions, User, WidgetId } from '@src/auth/types';

// Widget placeholder type
export interface WidgetPlaceholder {
  __widgetName: string;
  __widgetConfig: Record<string, unknown>;
  __isWidgetPlaceholder: true;
}

// Collection names are dynamic, based on the files in the collections directory

// Widget field type definition
type WidgetKeys = keyof widgets;
type WidgetTypes = (widgets)[WidgetKeys];

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
	id: string;  // UUID from collection file header
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
	translations?: { languageTag: string; translationName: string; }[];
	collections: Schema[]; // Collections within this category
	subcategories?: Record<string, Category>; // Added subcategories support
}

// Extended category interface for UI
export interface FilteredCategory extends Category {
  open?: boolean;
  level?: number;
}

// Category data interface for configuration
export interface CollectionData {
	id: string;
	icon: string;
	name: string;
	translations?: { languageTag: string; translationName: string; }[];
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

// Collection types

export type CollectionTypes = {
  "Names": {
    "fields": [
      "First Name",
      "Last Name"
    ],
    "type": "{First Name: string; Last Name: string}"
  },
  "Posts": {
    "fields": [
      "Email",
      "dbtest"
    ],
    "type": "{Email: string; dbtest: string}"
  },
  "Relation": {
    "fields": [
      "relationM2MPosts"
    ],
    "type": "{relationM2MPosts: string}"
  },
  "WidgetTest": {
    "fields": [
      "firstname",
      "middlename",
      "lastname",
      "Full_Text_option",
      "email",
      "remotevideo",
      "date",
      "datetime",
      "number",
      "currency",
      "phonenumber",
      "radio",
      "checkbox",
      "colorpicker",
      "rating",
      "RichText"
    ],
    "type": "{firstname: string; middlename: string; lastname: string; Full_Text_option: string; email: string; remotevideo: string; date: string; datetime: string; number: string; currency: string; phonenumber: string; radio: string; checkbox: string; colorpicker: string; rating: string; RichText: string}"
  },
  "Menu": {
    "fields": [
      "Menu"
    ],
    "type": "{Menu: string}"
  },
  "Names123": {
    "fields": [
      "First test",
      "Last Name"
    ],
    "type": "{First test: string; Last Name: string}"
  }
};

export type CollectionTypes = 'categories'|'CollectionManager'|'collectionTypes';

