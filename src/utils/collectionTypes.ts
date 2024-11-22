/**
 * @file src/utils/collectionTypes.ts
 * @description Utility functions for generating TypeScript types for collections in a SvelteKit CMS project.
 *
 * This file contains two main functions:
 * 1. generateCollectionTypes(): Generates a TypeScript union type of collection names.
 * 2. generateCollectionFieldTypes(): Generates TypeScript types for fields in each collection.
 *
 * These functions read from and write to the 'src/collections' directory and update the 'types.ts' file.
 *
 * @requires fs/promises - File system module with promise-based API
 * @requires path - Path manipulation utility
 * @requires typescript - TypeScript compiler API
 */

import fs from 'fs/promises';
import path from 'path';
import ts from 'typescript';
import type { Field } from '@src/collections/types';

const COLLECTIONS_DIR = 'src/collections';
const TYPES_FILE = path.join(COLLECTIONS_DIR, 'types.ts');
const EXCLUDED_FILES = new Set(['index.ts', 'types.ts', 'config.ts']);

// Generates TypeScript union type of collection names
export async function generateCollectionTypes(): Promise<void> {
	try {
		const files = await getCollectionFiles();
		const collections = `export type CollectionTypes = ${files.map((file) => `'${path.basename(file, '.ts')}'`).join('|')};`;

		let types = await fs.readFile(TYPES_FILE, 'utf-8');
		types = types.replace(/export\s+type\s+CollectionTypes\s?=\s?.*?;/gms, '');
		types += collections;

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
		const collections: Record<string, string> = {};

		for (const file of files) {
			const content = await fs.readFile(path.join(COLLECTIONS_DIR, file), 'utf-8');
			const { fields } = await processCollectionFile(content);
			collections[path.basename(file, '.ts')] = fields.join('|');
		}

		let types = await fs.readFile(TYPES_FILE, 'utf-8');
		types = types.replace(/\n*export\s+type\s+CollectionContent\s?=\s?.*?};/gms, '');
		types += `\nexport type CollectionContent = ${JSON.stringify(collections).replace(/"/g, '')};`;

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

async function processCollectionFile(content: string): Promise<{ fields: string[] }> {
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

	const { default: data } = await import('data:text/javascript,' + transpiledContent);

	return {
		fields: data.fields.map((field: Field) => field.db_fieldName || field.label)
	};
}
