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
import { logger, type LoggableValue } from '@utils/logger';

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
export const col2formData = async (getData: { [Key: string]: () => any }) => {
	// used to save data
	const formData = new FormData();
	const data: Record<string, any> = {};

	// Debugging: Log the initial object state
	logger.debug('Initial data object:', `${JSON.stringify(getData)}`);

	const parseFiles = async (object: any) => {
		for (const key in object) {
			if (!(object[key] instanceof File) && typeof object[key] == 'object') {
				parseFiles(object[key]);
				continue;
			} else if (!(object[key] instanceof File)) {
				continue;
			}
			const uuid = (await createRandomID()).toString();
			formData.append(uuid, object[key]);
			object[key] = { instanceof: 'File', id: uuid, path: object[key].path };
		}
	};

	for (const key in getData) {
		const value = await getData[key]();
		if (!value) continue;
		data[key] = value;
	}

	await parseFiles(data);
	// Debugging: Log the parsed data
	logger.debug('Parsed data:', data);

	for (const key in data) {
		if (typeof data[key] === 'object') {
			formData.append(key, JSON.stringify(data[key]));
		} else {
			formData.append(key, data[key]);
		}
	}

	// Debugging: Log FormData entries
	logger.debug('FormData entries:');
	for (const [key, value] of formData.entries()) {
		logger.debug(`FormData key: ${key}, value: ${value}`);
	}

	if (!formData.entries().next().value) {
		return null;
	}
	return formData;
};

// Helper function to sanitize file names
export function sanitize(str: string) {
	return str.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
}

// Get the environment variables for image sizes
const env_sizes = publicEnv.IMAGE_SIZES;
export const SIZES = { ...env_sizes, original: 0, thumbnail: 200 } as const;

// takes an object and recursively parses any values that can be converted to JSON
export function parse(obj: any) {
	for (const key in obj) {
		try {
			if (Array.isArray(obj[key])) {
				for (const index of obj[key]) {
					obj[key][index] = JSON.parse(obj[key][index]);
				}
			} else {
				obj[key] = JSON.parse(obj[key]);
			}
		} catch (e) {
			logger.error(`Error parsing JSON for key ${key}:`, e as LoggableValue);
		}

		if (typeof obj[key] != 'string') {
			parse(obj[key]);
		}
	}
	return obj;
}

// Converts fields to schema object
export const fieldsToSchema = (fields: Array<any>) => {
	// removes widget, so it does not set up in db
	let schema: any = {};
	for (const field of fields) {
		schema = { ...schema, ...field.schema };
	}
	delete schema.widget;
	return schema;
};

// Finds documents in collection that match query
export async function find(query: object, collectionName: string) {
	if (!collectionName) {
		logger.warn('find called without a collection name');
		return;
	}
	const _query = JSON.stringify(query);
	try {
		logger.debug(`Calling /api/find for collection: ${collectionName} with query: ${_query}`);
		const response = await axios.get(`/api/find?collection=${collectionName}&query=${_query}`);
		logger.debug(`Received response from /api/find for collection: ${collectionName}`);
		return response.data;
	} catch (err) {
		logger.error(`Error in find function for collection ${collectionName}:`, err as LoggableValue);
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
export async function findById(id: string, collectionName: string) {
	if (!id || !collectionName) {
		logger.warn(`findById called with invalid parameters. ID: ${id}, Collection: ${collectionName}`);
		return;
	}
	try {
		logger.debug(`Calling /api/find for collection: ${collectionName} with ID: ${id}`);
		const response = await axios.get(`/api/find?collection=${collectionName}&id=${id}`);
		logger.debug(`Received response from /api/find for collection: ${collectionName} with ID: ${id}`);
		return response.data;
	} catch (err) {
		logger.error(`Error in findById function for collection ${collectionName} and ID ${id}:`, err as LoggableValue);
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
export function getFieldName(field: any, sanitize = false) {
	if (sanitize) {
		return (field?.db_fieldName || field?.label)?.replaceAll(' ', '_');
	}
	return (field?.db_fieldName || field?.label) as string;
}

export async function extractData(fieldsData: any): Promise<{ [key: string]: any }> {
	// extract data from fieldsData because FieldsData is async
	const temp = {};
	for (const key in fieldsData) {
		temp[key] = await fieldsData[key]();
	}
	return temp;
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

export function removeExtension(fileName: any) {
	const lastDotIndex = fileName.lastIndexOf('.');
	if (lastDotIndex === -1) {
		return { name: fileName, ext: '' };
	}
	return { name: fileName.slice(0, lastDotIndex), ext: fileName.slice(lastDotIndex + 1) };
}

export const asAny = (value: any) => value;

function deepCopy(obj: any) {
	if (typeof obj !== 'object' || obj === null) {
		return obj;
	}

	if (obj instanceof Date) {
		return new Date(obj.getTime());
	}

	if (obj instanceof Array) {
		return obj.reduce((arr, item, i) => {
			arr[i] = deepCopy(item);
			return arr;
		}, []);
	}

	if (obj instanceof Object) {
		return Object.keys(obj).reduce((newObj, key) => {
			newObj[key] = deepCopy(obj[key]);
			return newObj;
		}, {});
	}
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

// Update translation progress
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
export const get_elements_by_id = {
	store: {},
	add(collection: string, id: string, callback: (data: any) => void) {
		if (!collection || !id) return;
		if (!this.store[collection]) {
			this.store[collection] = {};
		}
		if (!this.store[collection][id]) {
			this.store[collection][id] = [callback];
		} else {
			this.store[collection][id].push(callback);
		}
	},

	async getAll(dbAdapter: any) {
		const store = this.store;
		this.store = {};
		for (const collection in store) {
			const ids = Object.keys(store[collection]);
			try {
				logger.debug(`Fetching documents for collection: ${collection}, IDs: ${ids.join(', ')}`);
				const data = await dbAdapter.findOne(collection, { _id: { $in: ids } });
				logger.debug(`Fetched ${data.length} documents for collection: ${collection}`);

				for (const doc of data) {
					for (const callback of store[collection][doc._id.toString()]) {
						callback(doc);
					}
				}
			} catch (err) {
				logger.error(`Error fetching documents for collection ${collection}:`, err as LoggableValue);
			}
		}
	}
};

function getRandomHex(size) {
	const bytes = new Uint8Array(size);
	for (let i = 0; i < size; i++) {
		bytes[i] = Math.floor(Math.random() * 256);
	}

	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const createRandomID = async (id?: string) => {
	if (id) return id;
	return getRandomHex(16);
};

// Meta data
export const meta_data: {
	meta_data: { [key: string]: any };
	add: (key: 'media_images_remove', data: string[]) => void;
	clear: () => void;
	get: () => { [key: string]: any };
	is_empty: () => boolean;
	media_images?: { removed: string[] };
} = {
	meta_data: {},
	add(key, data) {
		switch (key) {
			case 'media_images_remove':
				if (!this.meta_data?.media_images) this.meta_data.media_images = { removed: [] };
				this.meta_data.media_images.removed.push(...data);
				break;
		}
	},
	get() {
		return this.meta_data;
	},
	clear() {
		this.meta_data = {};
	},
	is_empty() {
		return Object.keys(this.meta_data).length === 0;
	}
};

// PascalCase to camelCase
export const pascalToCamelCase = (str: string) => {
	return str.substring(0, 0) + str.charAt(0).toLowerCase() + str.substring(1);
};

// Escape regex metacharacters
RegExp.escape = (string) => {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Convert an object to form data
export const toFormData = function (obj: { [key: string]: string | number }) {
	const formData = new FormData();
	for (const key in obj) {
		if (typeof obj[key] == 'string') {
			formData.append(key, obj[key] as string);
		} else {
			formData.append(key, JSON.stringify(obj[key]));
		}
	}
	return formData;
};

// Get current date
export function get_date() {
	const d = new Date();
	return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Convert data to string
export function toStringHelper({ field, data, path }: { field: any; data: any[]; path: (lang: string) => string }) {
	if (!data) return '';
	if (field.translated) return path(publicEnv.DEFAULT_CONTENT_LANGUAGE);
	return publicEnv.AVAILABLE_CONTENT_LANGUAGES.reduce((acc, lang) => {
		return (acc += path(lang) + '\n');
	}, '\n');
}

export function sha256(buffer: Buffer) {
	return crypto.subtle.digest('SHA-256', buffer).then(function (hash) {
		return hex(hash);
	});
}

function hex(buffer: ArrayBuffer): string {
	let digest = '';
	const view = new DataView(buffer);
	for (let i = 0; i < view.byteLength; i += 4) {
		const value = view.getUint32(i);
		const stringValue = value.toString(16);
		const padding = '00000000';
		const paddedValue = (padding + stringValue).slice(-padding.length);
		digest += paddedValue;
	}
	return digest; // Return the digest
}
