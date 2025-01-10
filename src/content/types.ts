/**
 * @file src/content/types.ts
 * @description Content Type Definition for Content Manager
 *
 * Features:
 * - Collection Registry - defines all available collections
 * - Collection Types - defines all available collection types
 * - Field Types - defines all available field types
 * - Schema - defines the base schema interface
 * - Category - defines the category interface
 * - Collection Data - defines the category data interface for configuration
 */

import fs from 'fs/promises';
import path from 'path';
import ts from 'typescript';
import type widgets from '@widgets';
import type { ModifyRequestParams } from '@widgets';

const COLLECTIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'collections');
const TYPES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'types.ts');
const EXCLUDED_FILES = new Set(['index.ts', 'vite.ts']);

// Auth
import type { RolePermissions } from '@src/auth/types';


// Collection names are dynamic, based on the files in the collections directory

// Widget field type definition
type WidgetKeys = keyof typeof widgets;
type WidgetTypes = (typeof widgets)[WidgetKeys];

// Field value types
export type FieldValue = string | number | boolean | null | Record<string, unknown> | Array<unknown>;

// Extended field type with display and callback properties
export type Field =
	{
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
	name?: ContentTypes | string; // Collection name can be from registry or dynamic
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
	links?: Array<ContentTypes>; // Optional links to other collections
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

// Collection types
export type ContentTypes = Record<string, unknown>;


// Generates TypeScript union type of collection names
export async function generateContentTypes(): Promise<void> {
	try {
		const files = await getCollectionFiles();
		const contentTypes = files.map((file) => `'${path.basename(file, '.ts')}'`);
		const typeDefinition = `export type ContentTypes = ${contentTypes.join(' | ')};`;

		let types = await fs.readFile(TYPES_FILE, 'utf-8');
		types = types.replace(/export\s+type\s+ContentTypes\s?=\s?.*?;/gms, typeDefinition);
		await fs.writeFile(TYPES_FILE, types);
	} catch (error) {
		console.error('Error generating collection types:', error);
		throw error;
	}
}

// Generates TypeScript types for fields in each collection.
export async function generateCollectionFieldTypes(): Promise<void> {
	try {
		const files = await getCollectionFiles();
		const collections: Record<string, { fields: string[]; schema: Record<string, string> }> = {};

		for (const file of files) {
			const content = await fs.readFile(path.join(COLLECTIONS_DIR, file), 'utf-8');
			const { fields, schema } = await processCollectionFile(content);
			const collectionName = path.basename(file, '.ts');
			collections[collectionName] = { fields, schema };
		}

		let types = await fs.readFile(TYPES_FILE, 'utf-8');
		const contentTypesDef = `export type CollectionFieldTypes = ${JSON.stringify(collections, null, 2)};`;
		types = types.replace(/export\s+type\s+CollectionFieldTypes\s?=\s?.*?;/gms, contentTypesDef);

		await fs.writeFile(TYPES_FILE, types);
	} catch (error) {
		console.error('Error generating collection field types:', error);
		throw error;
	}
}

async function getCollectionFiles(): Promise<string[]> {
	const allFiles = await fs.readdir(COLLECTIONS_DIR);
	return allFiles.filter((file) => !EXCLUDED_FILES.has(file) && file.endsWith('.ts'));
}

async function processCollectionFile(content: string): Promise<{ fields: string[]; schema: Record<string, string> }> {
	const widgets = new Set<string>();
	content.match(/widgets\.(\w+)\(/g)?.forEach((match) => widgets.add(match.slice(8, -1)));

	const processedContent = `
        ${Array.from(widgets)
			.map((widget) => `const ${widget} = (args: any) => args;`)
			.join('\n')}
        ${content.replace(/widgets\./g, '')}
    `;

	const transpiledContent = ts.transpile(processedContent, {
		target: ts.ScriptTarget.ESNext,
		module: ts.ModuleKind.ESNext
	});

	const { default: data } = await import(/* @vite-ignore */ 'data:text/javascript,' + transpiledContent);

	return {
		fields: data.fields.map((field: Field) => field.db_fieldName || field.label),
		schema: data.schema
	};
}
