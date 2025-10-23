/**
 * @file src/utils/utils.ts
 * @description A comprehensive utility module for the SvelteKit CMS project.
 *
 * This file contains a wide range of utility functions and helpers used throughout the application, including:
 * - Form data handling and conversion (obj2formData, col2formData)
 * - File and media operations (sanitize, formatBytes, deleteOldTrashFiles)
 * - Date and time formatting (convertTimestampToDateString, formatUptime, ReadableExpireIn)
 * - Data manipulation and validation (extractData, deepCopy, validateValibot)
 * - Internationalization helpers (getTextDirection)
 * - UI-related utilities (getGuiFields, motion)
 * - String manipulation (pascalToCamelCase, getEditDistance)
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

import type { FieldInstance, FieldValue } from '@src/content/types';
import { publicEnv } from '@src/stores/globalSettings.svelte';
import type { BaseIssue, BaseSchema } from 'valibot';

// Stores
import { contentLanguage } from '@stores/store.svelte';
import { get } from 'svelte/store';

// System Logger
import { logger, type LoggableValue } from '@utils/logger.svelte';

// Validation
import * as v from 'valibot';

export const config = {
	headers: {
		'Content-Type': 'multipart/form-data'
	}
};

// Interface for GUI field configuration
export interface GuiFieldConfig {
	widget: unknown;
	required: boolean;
}

export function uniqueItems(items: Record<string, unknown>[], key: string): object[] {
	const uniqueItems = Array.from(new Map(items.map((item) => [item[key], item])).values());

	return uniqueItems;
}

// This function generates GUI fields based on field parameters and a GUI schema.
export const getGuiFields = (fieldParams: Record<string, unknown>, GuiSchema: Record<string, GuiFieldConfig>): Record<string, unknown> => {
	const guiFields: Record<string, unknown> = {};
	for (const key in GuiSchema) {
		if (Object.prototype.hasOwnProperty.call(fieldParams, key) && Array.isArray(fieldParams[key])) {
			guiFields[key] = deepCopy(fieldParams[key] as unknown[]);
		} else if (Object.prototype.hasOwnProperty.call(fieldParams, key)) {
			guiFields[key] = fieldParams[key];
		}
	}
	return guiFields;
};

// Function to convert an object to form data
export const obj2formData = (obj: Record<string, unknown>) => {
	const formData = new FormData();

	const transformValue = (value: unknown): string | Blob => {
		if (value instanceof Blob) {
			return value;
		} else if (typeof value === 'object' && value !== null) {
			return JSON.stringify(value);
		} else if (typeof value === 'boolean' || typeof value === 'number') {
			return value.toString();
		} else if (value === null || value === undefined) {
			return '';
		}
		return String(value);
	};

	for (const key in obj) {
		const value = obj[key];
		if (value !== undefined) {
			formData.append(key, transformValue(value));
		}
	}

	return formData;
};

// Converts data to FormData object with optimized file handling and type safety
export const col2formData = async (getData: Record<string, () => Promise<unknown> | unknown>): Promise<FormData> => {
	const formData = new FormData();

	const processValue = async (value: unknown): Promise<string | Blob> => {
		if (value instanceof Blob) return value;
		if (value instanceof Promise) {
			const resolvedValue = await value;
			return processValue(resolvedValue);
		}
		if (value instanceof Object) {
			return JSON.stringify(value);
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

	await appendToForm();
	return formData;
};

// Helper function to sanitize file names
export function sanitize(str: string) {
	return str.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
}

// Get the environment variables for image sizes
const env_sizes = publicEnv.IMAGE_SIZES || {};
export const SIZES = { ...env_sizes, original: 0, thumbnail: 200 } as const;

// Takes an object and recursively parses any values that can be converted to JSON
export function parse<T>(obj: unknown): T {
	if (typeof obj !== 'object' || obj === null) {
		return obj as T;
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => parse(item)) as unknown as T;
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

// Returns field's database field name or label
export function getFieldName(field: Partial<FieldInstance> & { label: string }, rawName = false): string {
	if (!field) return '';

	// Use explicit db_fieldName if available
	if (field.db_fieldName) {
		return rawName ? field.db_fieldName : field.db_fieldName;
	}

	// Special field name mappings
	const specialMappings: Record<string, string> = {
		'First Name': 'first_name',
		'Last Name': 'last_name'
	};

	// Get the field name from label, or fallback to widget name
	let name = field.label;
	if (!name && 'widget' in field && field.widget?.Name) {
		name = field.widget.Name;
	}
	if (!name && 'type' in field) {
		name = field.type as string;
	}
	if (!name) {
		name = 'unknown_field';
	}

	// Return raw UI name if requested
	if (rawName) return name;

	// Check special mappings first
	if (specialMappings[name]) {
		return specialMappings[name];
	}

	// Default sanitization:
	// 1. Convert to lowercase
	// 2. Replace spaces with underscores
	// 3. Remove special characters
	return name
		.toLowerCase()
		.replace(/\s+/g, '_')
		.replace(/[^a-z0-9_]/g, '');
}

// Sanitizes field names for use in GraphQL type names
// GraphQL type names must be valid identifiers: [A-Za-z_][A-Za-z0-9_]*
export function sanitizeGraphQLTypeName(name: string): string {
	if (!name) return '';

	// 1. Replace spaces with underscores
	// 2. Remove special characters except underscores
	// 3. Ensure it starts with a letter or underscore
	let sanitized = name.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');

	// Ensure the name starts with a letter or underscore (GraphQL requirement)
	if (sanitized && !/^[A-Za-z_]/.test(sanitized)) {
		sanitized = `_${sanitized}`;
	}

	return sanitized || '_invalid_name';
}

// Extract data from fields
export async function extractData(fieldsData: Record<string, FieldInstance>): Promise<Record<string, unknown>> {
	const result: Record<string, unknown> = {};
	for (const [key, field] of Object.entries(fieldsData)) {
		if (field.callback) {
			result[key] = await field.callback({ data: field as unknown as Record<string, FieldValue> });
		} else {
			result[key] = field.default ?? null;
		}
	}
	return result;
}

function deepCopy<T>(obj: T): T {
	if (obj === null || typeof obj !== 'object') {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => deepCopy(item)) as unknown as T;
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
	if (bytes === 0 || isNaN(bytes)) {
		return '0 bytes';
	}

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
	field?: FieldInstance;
	data: unknown[];
	path?: (lang: string) => string;
}

export function toStringHelper({ data }: StringHelperParams): string {
	if (!Array.isArray(data)) return '';
	return data.map((item: unknown) => String(item)).join(', ');
}

// Get random hex string
export function getRandomHex(size: number): string {
	const bytes = new Uint8Array(size);
	for (let i = 0; i < size; i++) {
		bytes[i] = Math.floor(Math.random() * 256);
	}
	return Array.from(bytes)
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

// Escape regex metacharacters
export function escapeRegex(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Get current date in YYYY-MM-DD format
export function getCurrentDate(): string {
	const d = new Date();
	return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

// SHA-256 hash function
export async function sha256(buffer: ArrayBuffer): Promise<string> {
	const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
	return arrayBuffer2hex(hashBuffer);
}

// Enhanced debounce utility with flexible patterns
export function debounce(delay: number = 300, immediate: boolean = false) {
	let timer: NodeJS.Timeout | undefined;
	let hasExecuted = false;

	return (fn: () => void) => {
		const shouldExecuteImmediately = immediate && !hasExecuted;

		if (shouldExecuteImmediately) {
			fn();
			hasExecuted = true;
			return;
		}

		clearTimeout(timer);
		timer = setTimeout(() => {
			fn();
		}, delay);
	};
}

// Traditional debounce pattern - takes function and delay, returns debounced version
debounce.create = function <T extends (...args: unknown[]) => unknown>(func: T, wait: number = 300): (...args: Parameters<T>) => void {
	let timeout: ReturnType<typeof setTimeout>;

	return function executedFunction(...args: Parameters<T>) {
		const later = () => {
			clearTimeout(timeout);
			func(...args);
		};

		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
	};
};

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

// PascalCase to camelCase conversion
export const pascalToCamelCase = (str: string): string => {
	if (!str) return str;
	return str.charAt(0).toLowerCase() + str.slice(1);
};

// Type assertion helper - used for widget type assertions
export function asAny<T>(value: unknown): T {
	return value as T;
}
