/**
 * @file src/utils/utils.ts
 * @description A comprehensive utility module for the SvelteKit CMS project.
 *
 * This file contains a wide range of utility functions and helpers used throughout the application, including:
 * - Form data handling and conversion (obj2formData, col2formData)
 * - File and media operations (sanitize, formatBytes, deleteOldTrashFiles)
 * - Date and time formatting (convertTimestampToDateString, formatUptime, ReadableExpireIn)
 * - Data manipulation and validation (extractData, deepCopy, validateValibot)
 * - Internationalization helpers (getTextDirection, updateTranslationProgress)
 * - Database operations (find, findById)
 * - UI-related utilities (getGuiFields, motion)
 * - String manipulation (pascalToCamelCase, getEditDistance)
 * - Cryptographic functions (createRandomID, sha256)
 * - And various other helper functions
 *
 * The module also defines important constants and types used across the application.
 *
 * @requires various - Including fs, axios, valibot, and custom types/interfaces
 * @requires @stores/store - For accessing Svelte stores
 * @requires @root/config/public - For accessing public environment variables
 *
 * @exports numerous utility functions and constants
 */

import { publicEnv } from '@root/config/public';
import axios from 'axios';
import * as v from 'valibot';
import type { BaseIssue, BaseSchema } from 'valibot';

// Stores
import { get } from 'svelte/store';
import { translationProgress, contentLanguage } from '@stores/store';

// System Logger
import { logger, type LoggableValue } from '@utils/logger.svelte';

export const config = {
	headers: {
		'Content-Type': 'multipart/form-data'
	}
};

// This function generates GUI fields based on field parameters and a GUI schema.
export const getGuiFields = (fieldParams: { [key: string]: any }, GuiSchema: { [key: string]: any }) => {
	const guiFields = {};
	for (const key in GuiSchema) {
		if (Array.isArray(fieldParams[key])) {
			guiFields[key] = deepCopy(fieldParams[key]);
		} else {
			guiFields[key] = fieldParams[key];
		}
	}
	return guiFields;
};

// Function to convert an object to form data
export const obj2formData = (obj: Record<string, any>) => {
	const formData = new FormData();

	const transformValue = (key: string, value: any): any => {
		// Define specific handling cases
		if (!value && value !== false) return undefined;
		if (key === 'schema') return undefined;
		if (key === 'display') {
			if (value?.default) return undefined;
			return `🗑️${value}🗑️`.replaceAll('display', 'function display');
		}
		if (key === 'widget') {
			return { key: value.key, GuiFields: value.GuiFields };
		}
		if (typeof value === 'function') return `🗑️${value}🗑️`;
		return value;
	};

	// Iterate over entries to avoid redundant lookups
	for (const [key, originalValue] of Object.entries(obj)) {
		const transformedValue = transformValue(key, originalValue);
		if (transformedValue === undefined) continue; // Skip invalid values

		const serialized = JSON.stringify(transformedValue);
		if (serialized) formData.append(key, serialized); // Append only valid data
	}

	return formData;
};

// Converts data to FormData object with optimized file handling and type safety
export const col2formData = (getData: Record<string, () => Promise<unknown> | unknown>): FormData => {
    const formData = new FormData();
    
    const processValue = async (value: unknown): Promise<string | Blob> => {
        if (value instanceof Blob) return value;
        if (value instanceof Promise) {
            const resolvedValue = await value;
            return processValue(resolvedValue);
        }
        return String(value);
    };

    const appendToForm = async () => {
        for (const [key, getter] of Object.entries(getData)) {
            const value = getter();
            const processedValue = await processValue(value);
            formData.append(key, processedValue);
        }
    };

    void appendToForm();
    return formData;
};

// Helper function to sanitize file names
export function sanitize(str: string) {
	return str.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
}

// Get the environment variables for image sizes
const env_sizes = publicEnv.IMAGE_SIZES;
export const SIZES = { ...env_sizes, original: 0, thumbnail: 200 } as const;

// Takes an object and recursively parses any values that can be converted to JSON
export function parse<T>(obj: unknown): T {
    if (typeof obj !== 'object' || obj === null) {
        return obj as T;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => parse(item)) as unknown as T;
    }

    const result = {} as { [key: string]: unknown };
    for (const [key, value] of Object.entries(obj as object)) {
        if (typeof value === 'string') {
            try {
                result[key] = JSON.parse(value);
            } catch {
                result[key] = value;
            }
        } else {
            result[key] = parse(value);
        }
    }
    return result as T;
}

// Convert an object to form data
export const toFormData = (obj: Record<string, string | number | boolean>): FormData => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(obj)) {
        formData.append(key, String(value));
    }
    return formData;
};

// Converts fields to schema object
interface SchemaField {
    type: string;
    widget?: unknown;
    [key: string]: unknown;
}

export const fieldsToSchema = (fields: SchemaField[]): Record<string, unknown> => {
    const schema: Record<string, unknown> = {};
    
    for (const field of fields) {
        const { type, ...rest } = field;
        schema[type] = rest;
    }
    
    return schema;
};

// Finds documents in collection that match query
export async function find(query: object, collectionTypes: string) {
	if (!collectionTypes) {
		logger.warn('find called without a collection name');
		return;
	}
	const _query = JSON.stringify(query);
	try {
		logger.debug(`Calling /api/find for collection: ${collectionTypes} with query: ${_query}`);
		const response = await axios.get(`/api/find?collection=${collectionTypes}&query=${_query}`);
		logger.debug(`Received response from /api/find for collection: ${collectionTypes}`);
		return response.data;
	} catch (err) {
		logger.error(`Error in find function for collection ${collectionTypes}:`, err as LoggableValue);
		if (axios.isAxiosError(err)) {
			logger.error('Axios error details:', {
				response: err.response?.data,
				status: err.response?.status,
				headers: err.response?.headers
			});
		}
		throw err; // Re-throw the error after logging
	}
}

// Finds document in collection with specified ID
export async function findById(id: string, collectionTypes: string) {
	if (!id || !collectionTypes) {
		logger.warn(`findById called with invalid parameters. ID: ${id}, Collection: ${collectionTypes}`);
		return;
	}
	try {
		logger.debug(`Calling /api/find for collection: ${collectionTypes} with ID: ${id}`);
		const response = await axios.get(`/api/find?collection=${collectionTypes}&id=${id}`);
		logger.debug(`Received response from /api/find for collection: ${collectionTypes} with ID: ${id}`);
		return response.data;
	} catch (err) {
		logger.error(`Error in findById function for collection ${collectionTypes} and ID ${id}:`, err as LoggableValue);
		if (axios.isAxiosError(err)) {
			logger.error('Axios error details:', {
				response: err.response?.data,
				status: err.response?.status,
				headers: err.response?.headers
			});
		}
		throw err; // Re-throw the error after logging
	}
}

// Returns field's database field name or label
export function getFieldName(field: Field, sanitize = false): string {
    if (!field) return '';
    const name = field.label || field.type;
    return sanitize ? name.toLowerCase().replace(/\s+/g, '_') : name;
}

// Extract data from fields
export async function extractData(fieldsData: Record<string, Field>): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(fieldsData)) {
        if (field.callback) {
            result[key] = await field.callback({ data: field });
        } else {
            result[key] = field;
        }
    }
    return result;
}

function deepCopy<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => deepCopy(item)) as unknown as T;
    }

    const copy = {} as T;
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            copy[key] = deepCopy(obj[key]);
        }
    }
    return copy;
}

// Remove file extension
export function removeExtension(fileName: string): string {
    return fileName.replace(/\.[^/.]+$/, '');
}

/**
 * Formats a file size in bytes to the appropriate unit (bytes, kilobytes, megabytes, or gigabytes).
 * @param sizeInBytes - The size of the file in bytes.
 * @returns The formatted file size as a string.
 */
export function formatBytes(bytes: number): string {
	if (bytes < 0) {
		throw Error('Input size cannot be negative');
	}

	const units = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
	let power = 0;

	while (bytes >= 1024 && power < units.length - 1) {
		bytes /= 1024;
		power++;
	}

	return `${bytes.toFixed(2)} ${units[power]}`;
}

// Function to convert Unix timestamp to readable date string
export function convertTimestampToDateString(timestamp: number) {
	if (timestamp === null || timestamp === undefined) {
		return '-';
	}

	const options: Intl.DateTimeFormatOptions = {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	};
	const locale = get(contentLanguage);
	const date = new Date(timestamp * 1000);
	return date.toLocaleDateString(locale, options);
}

export function formatUptime(uptime: number) {
	const units = [
		{ label: ['year', 'years'], value: 365 * 24 * 60 * 60 },
		{ label: ['month', 'months'], value: 30 * 24 * 60 * 60 },
		{ label: ['week', 'weeks'], value: 7 * 24 * 60 * 60 },
		{ label: ['day', 'days'], value: 24 * 60 * 60 },
		{ label: ['hour', 'hours'], value: 60 * 60 },
		{ label: ['minute', 'minutes'], value: 60 },
		{ label: ['second', 'seconds'], value: 1 }
	];

	const result: string[] = [];
	for (const unit of units) {
		const quotient = Math.floor(uptime / unit.value);
		if (quotient > 0) {
			result.push(`${quotient} ${unit.label[quotient > 1 ? 1 : 0]}`);
			uptime %= unit.value;
		}
	}

	return result.join(' ');
}

// Export function for ReadableExpireIn
export function ReadableExpireIn(expiresIn: string) {
	const expiresInNumber = parseInt(expiresIn, 10);
	const expirationTime = expiresInNumber ? new Date(Date.now() + expiresInNumber * 1000) : new Date();

	const daysDiff = Math.floor((expirationTime.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
	const hoursDiff = Math.floor((expirationTime.getTime() - Date.now()) / (1000 * 60 * 60)) % 24;
	const minutesDiff = Math.floor((expirationTime.getTime() - Date.now()) / (1000 * 60)) % 60;

	const daysText = daysDiff > 0 ? `${daysDiff} day${daysDiff > 1 ? 's' : ''}` : '';
	const hoursText = hoursDiff > 0 ? `${hoursDiff} hour${hoursDiff > 1 ? 's' : ''}` : '';
	const minutesText = minutesDiff > 0 ? `${minutesDiff} minute${minutesDiff > 1 ? 's' : ''}` : '';

	return `${daysText} ${hoursText} ${minutesText}`.trim();
}

export function updateTranslationProgress(data, field) {
	const languages = publicEnv.AVAILABLE_CONTENT_LANGUAGES;
	translationProgress.update((current) => {
		for (const lang of languages) {
			if (!current[lang]) {
				current[lang] = { total: new Set(), translated: new Set() };
			}

			if (field?.translated) {
				current[lang].total.add(field);
				if (data[lang]) {
					current[lang].translated.add(field);
				} else {
					current[lang].translated.delete(field);
				}
			}
		}
		return current;
	});
}

// Get elements by ID
interface ElementStore {
    [key: string]: {
        id: string;
        callback: (data: unknown) => void;
    }[];
}

export const get_elements_by_id = {
    store: {} as ElementStore,
    add(collection: string, id: string, callback: (data: unknown) => void) {
        if (!this.store[collection]) {
            this.store[collection] = [];
        }
        this.store[collection].push({ id, callback });
    },
    async getAll(dbAdapter: { get: (id: string) => Promise<unknown> }) {
        for (const collection in this.store) {
            for (const item of this.store[collection]) {
                const data = await dbAdapter.get(item.id);
                item.callback(data);
            }
        }
    }
};

// Meta data types
interface MetaData {
    media_images_remove?: string[];
    [key: string]: unknown;
}

export const meta_data = {
    meta_data: {} as MetaData,
    add(key: keyof MetaData, data: unknown) {
        this.meta_data[key] = data;
    },
    get(): MetaData {
        return this.meta_data;
    },
    clear() {
        this.meta_data = {};
    },
    is_empty(): boolean {
        return Object.keys(this.meta_data).length === 0;
    }
};

// Convert data to string
interface StringHelperParams {
    field: Field;
    data: unknown[];
    path: (lang: string) => string;
}

export function toStringHelper({ field, data, path }: StringHelperParams): string {
    if (!Array.isArray(data)) return '';
    return data.map((item) => item.toString()).join(', ');
}

// Create a random ID
export async function createRandomID(size = 32): Promise<string> {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

// Get random hex string
export function getRandomHex(size: number): string {
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

// Escape regex metacharacters
export function escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Get current date in YYYY-MM-DD format
export function getCurrentDate(): string {
    const d = new Date();
    return d.getFullYear() + '-' + 
           String(d.getMonth() + 1).padStart(2, '0') + '-' + 
           String(d.getDate()).padStart(2, '0');
}

// Convert hex to array buffer
export function hex2arrayBuffer(hex: string): ArrayBuffer {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes.buffer;
}

// Convert array buffer to hex
export function arrayBuffer2hex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

// SHA-256 hash function
export async function sha256(buffer: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return arrayBuffer2hex(hashBuffer);
}

export function debounce(delay?: number) {
	let timer: NodeJS.Timeout | undefined;
	let first = true;
	return (fn: () => void) => {
		if (first) {
			fn();
			first = false;
			return;
		}
		clearTimeout(timer);
		timer = setTimeout(() => {
			fn();
		}, delay);
	};
}

// Validates data against a Valibot schema, returning errors or null if valid
export function validateValibot<T>(schema: BaseSchema<T, T, BaseIssue<unknown>>, value?: T): null | { [P in keyof T]?: string[] } {
	try {
		// Use v.safeParse to handle parsing
		const result = v.safeParse(schema, value);

		if (result.success) {
			return null; // No errors
		}

		const fieldErrors = {} as { [P in keyof T]?: string[] };

		// Iterate over issues and populate field errors
		for (const issue of result.issues) {
			const path = issue.path?.[0]?.key as keyof T;
			if (path) {
				fieldErrors[path] = fieldErrors[path] || [];
				fieldErrors[path]!.push(issue.message);
			}
		}

		return fieldErrors;
	} catch (error) {
		logger.error('Validation error:', error as LoggableValue);
		return null;
	}
}

export function getTextDirection(lang: string): string {
	const rtlLanguages = ['ar', 'he', 'fa', 'ur', 'dv', 'ha', 'khw', 'ks', 'ku', 'ps', 'syr', 'ug', 'yi'];
	return rtlLanguages.includes(lang) ? 'rtl' : 'ltr';
}

export async function motion(start: number[], end: number[], duration: number, cb: (current: number[]) => void) {
	const current = [...start];
	let elapsed = 0;
	let time = Date.now();
	let has_passed = false;
	setTimeout(() => {
		has_passed = true;
	}, duration);
	return new Promise<void>((resolve) => {
		function animation(current: number[]) {
			elapsed = Date.now() - time;
			const ds = start.map((s, i) => (s - end[i]) / (duration / elapsed));

			time = Date.now();
			for (const index in ds) {
				current[index] -= ds[index];
			}

			if (has_passed) {
				cb(end);
				resolve();
				return;
			} else {
				cb(current);
				requestAnimationFrame(() => animation(current));
			}
		}

		requestAnimationFrame(() => animation(current));
	});
}

export function getEditDistance(a: string, b: string): number | undefined {
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	const insertionCost = 1;
	const deletionCost = 1;
	const substitutionCost = 1;

	const matrix: number[][] = [];

	for (let i = 0; i <= b.length; i++) {
		matrix[i] = [i];
	}
	for (let j = 0; j <= a.length; j++) {
		matrix[0][j] = j;
	}

	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(matrix[i - 1][j - 1] + substitutionCost, Math.min(matrix[i][j - 1] + insertionCost, matrix[i - 1][j] + deletionCost));
			}
		}
	}

	const maxDistance = Math.max(a.length, b.length);
	const normalizedDistance = matrix[b.length][a.length] / maxDistance;

	return normalizedDistance;
}

// Collection name conflict checking types
interface CollectionNameCheck {
    exists: boolean;
    suggestions?: string[];
    conflictPath?: string;
}

export async function checkCollectionNameConflict(
    name: string,
    collectionsPath: string
): Promise<CollectionNameCheck> {
    try {
        // Handle relative paths by joining with process.cwd()
        const absolutePath = path.isAbsolute(collectionsPath)
            ? collectionsPath
            : path.join(process.cwd(), collectionsPath);
        
        const files = await getAllCollectionFiles(absolutePath);
        const existingNames = new Set<string>();
        let conflictPath: string | undefined;

        // Build set of existing names and check for conflict
        for (const file of files) {
            const fileName = path.basename(file, '.ts');
            if (fileName === name) {
                // Convert absolute path to relative for display
                conflictPath = path.relative(process.cwd(), file);
            }
            existingNames.add(fileName);
        }

        if (conflictPath) {
            // Generate suggestions if there's a conflict
            const suggestions = generateNameSuggestions(name, existingNames);
            return { exists: true, suggestions, conflictPath };
        }

        return { exists: false };
    } catch (error) {
        console.error('Error checking collection name:', error);
        return { exists: false };
    }
}

async function getAllCollectionFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await getAllCollectionFiles(fullPath));
        } else if (
            entry.isFile() &&
            entry.name.endsWith('.ts') &&
            !entry.name.startsWith('_') &&
            !['index.ts', 'types.ts', 'categories.ts', 'CollectionManager.ts'].includes(entry.name)
        ) {
            files.push(fullPath);
        }
    }

    return files;
}

function generateNameSuggestions(name: string, existingNames: Set<string>): string[] {
    const suggestions: string[] = [];
    
    // Try adding numbers
    let counter = 1;
    while (suggestions.length < 3 && counter <= 99) {
        const suggestion = `${name}${counter}`;
        if (!existingNames.has(suggestion)) {
            suggestions.push(suggestion);
        }
        counter++;
    }

    // Try adding prefixes/suffixes if we need more suggestions
    const commonPrefixes = ['New', 'Alt', 'Copy'];
    for (const prefix of commonPrefixes) {
        if (suggestions.length >= 5) break;
        const suggestion = `${prefix}${name}`;
        if (!existingNames.has(suggestion)) {
            suggestions.push(suggestion);
        }
    }

    return suggestions;
}
