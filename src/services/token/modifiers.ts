/**
 * @file src/services/token/modifiers.ts
 * @description Comprehensive modifier system with math, path, and enhanced date operations
 *
 * Features:
 * - Text Modifiers
 * - Math Modifiers
 * - Date Modifiers
 * - Path Modifiers
 * - Logic Modifiers
 * - Security Modifiers
 * - CMS Specific Modifiers
 */

import { formatDateString } from '@utils/dateUtils';
import type { ModifierFunction, ModifierMetadata } from './types';

export const modifierRegistry = new Map<string, ModifierFunction>();

// EXECUTION LOGIC
const functions: Record<string, ModifierFunction> = {
	// ===== TEXT MODIFIERS =====
	upper: (v) => String(v ?? '').toUpperCase(),
	lower: (v) => String(v ?? '').toLowerCase(),
	capitalize: (v) => String(v ?? '').replace(/\b\w/g, (c) => c.toUpperCase()),

	slug: (v) =>
		String(v ?? '')
			.toLowerCase()
			.trim()
			.replace(/[^\w\s-]/g, '')
			.replace(/[\s_-]+/g, '-'),

	truncate: (v, args) => {
		const len = Number.parseInt(args?.[0] || '50', 10);
		const s = String(v ?? '');
		return s.length > len ? s.substring(0, len) + (args?.[1] ?? '...') : s;
	},

	// ===== MATH MODIFIERS =====
	add: (v, args) => String(Number.parseFloat(String(v)) + Number.parseFloat(args?.[0] || '0')),
	subtract: (v, args) => String(Number.parseFloat(String(v)) - Number.parseFloat(args?.[0] || '0')),
	multiply: (v, args) => String(Number.parseFloat(String(v)) * Number.parseFloat(args?.[0] || '1')),
	divide: (v, args) => {
		const divisor = Number.parseFloat(args?.[0] || '1');
		return divisor === 0 ? 'NaN' : String(Number.parseFloat(String(v)) / divisor);
	},
	round: (v, args) => {
		const decimals = Number.parseInt(args?.[0] || '0', 10);
		return String(Math.round(Number.parseFloat(String(v)) * 10 ** decimals) / 10 ** decimals);
	},
	ceil: (v) => String(Math.ceil(Number.parseFloat(String(v)))),
	floor: (v) => String(Math.floor(Number.parseFloat(String(v)))),
	abs: (v) => String(Math.abs(Number.parseFloat(String(v)))),
	min: (v, args) => String(Math.min(Number.parseFloat(String(v)), Number.parseFloat(args?.[0] || '0'))),
	max: (v, args) => String(Math.max(Number.parseFloat(String(v)), Number.parseFloat(args?.[0] || '0'))),
	number: (v, args) => {
		const decimals = Number.parseInt(args?.[0] || '0', 10);
		return Number.parseFloat(String(v)).toFixed(decimals);
	},

	// ===== DATE MODIFIERS =====
	date: (v, args) => {
		if (!v) {
			return '';
		}

		// Preset formats
		const presets: Record<string, string> = {
			iso: "yyyy-MM-dd'T'HH:mm:ssxxx",
			date: 'yyyy-MM-dd',
			time: 'HH:mm:ss',
			datetime: 'yyyy-MM-dd HH:mm:ss',
			short: 'M/d/yy',
			long: 'MMMM d, yyyy',
			full: 'EEEE, MMMM d, yyyy',
			relative: 'relative', // Special case
			timestamp: 'timestamp' // Special case
		};

		const format = args?.[0] || 'date';
		const dateObj = typeof v === 'string' ? new Date(v) : (v as Date);

		// Handle special formats
		if (format === 'timestamp') {
			return String(dateObj.getTime());
		}

		if (format === 'relative') {
			const now = Date.now();
			const diff = now - dateObj.getTime();
			const seconds = Math.floor(diff / 1000);
			const minutes = Math.floor(seconds / 60);
			const hours = Math.floor(minutes / 60);
			const days = Math.floor(hours / 24);

			if (days > 0) {
				return `${days} day${days > 1 ? 's' : ''} ago`;
			}
			if (hours > 0) {
				return `${hours} hour${hours > 1 ? 's' : ''} ago`;
			}
			if (minutes > 0) {
				return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
			}
			return 'just now';
		}

		const actualFormat = presets[format] || format;
		return formatDateString(v as string | Date, actualFormat, '');
	},

	// ===== PATH MODIFIERS =====
	basename: (v) => {
		const path = String(v ?? '');
		return path.split('/').pop() || path;
	},

	dirname: (v) => {
		const path = String(v ?? '');
		const parts = path.split('/');
		parts.pop();
		return parts.join('/') || '/';
	},

	extension: (v) => {
		const path = String(v ?? '');
		const match = path.match(/\.([^.]+)$/);
		return match ? match[1] : '';
	},

	filename: (v) => {
		const path = String(v ?? '');
		const base = path.split('/').pop() || path;
		return base.replace(/\.[^.]+$/, '');
	},

	path: (v) => String(v ?? '').replace(/\\/g, '/'),

	cleanurl: (v) => {
		return String(v ?? '')
			.replace(/^https?:\/\//, '')
			.replace(/\/$/, '');
	},

	// ===== LOGIC MODIFIERS =====
	default: (v, args) => (!v || v === '' ? (args?.[0] ?? '') : String(v)),
	if: (v, args) => (v && v !== 'false' ? (args?.[0] ?? '') : (args?.[1] ?? '')),
	eq: (v, args) => (String(v) === String(args?.[0]) ? 'true' : 'false'),
	ne: (v, args) => (String(v) !== String(args?.[0]) ? 'true' : 'false'),
	gt: (v, args) => (Number.parseFloat(String(v)) > Number.parseFloat(args?.[0] || '0') ? 'true' : 'false'),
	lt: (v, args) => (Number.parseFloat(String(v)) < Number.parseFloat(args?.[0] || '0') ? 'true' : 'false'),

	// ===== SECURITY =====
	escape: (v) =>
		String(v ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;'),

	// ===== CMS SPECIFIC =====
	image_style: (v, args) => {
		if (!v) {
			return '';
		}
		const style = args?.[0] || 'original';
		return `/api/media/${v}?style=${style}`;
	}
};

// Register all modifiers
Object.entries(functions).forEach(([k, v]) => {
	modifierRegistry.set(k.toLowerCase(), v);
});

// UI METADATA
export const modifierMetadata: ModifierMetadata[] = [
	// TEXT
	{
		name: 'upper',
		label: 'Uppercase',
		description: 'Convert text to UPPERCASE',
		accepts: ['string'],
		args: []
	},
	{
		name: 'lower',
		label: 'Lowercase',
		description: 'Convert text to lowercase',
		accepts: ['string'],
		args: []
	},
	{
		name: 'capitalize',
		label: 'Capitalize Words',
		description: 'Capitalize The First Letter Of Each Word',
		accepts: ['string'],
		args: []
	},
	{
		name: 'slug',
		label: 'URL Slug',
		description: 'Convert to URL-friendly format (hello-world)',
		accepts: ['string'],
		args: []
	},
	{
		name: 'truncate',
		label: 'Truncate Text',
		description: 'Shorten text to specified length',
		accepts: ['string'],
		args: [
			{ name: 'Length', type: 'number', default: 50 },
			{ name: 'Suffix', type: 'text', default: '...' }
		]
	},

	// MATH
	{
		name: 'add',
		label: 'Add Number',
		description: 'Add a value to this number',
		accepts: ['number'],
		args: [{ name: 'Value', type: 'number', default: 1 }]
	},
	{
		name: 'subtract',
		label: 'Subtract Number',
		description: 'Subtract a value from this number',
		accepts: ['number'],
		args: [{ name: 'Value', type: 'number', default: 1 }]
	},
	{
		name: 'multiply',
		label: 'Multiply',
		description: 'Multiply by a value',
		accepts: ['number'],
		args: [{ name: 'Multiplier', type: 'number', default: 2 }]
	},
	{
		name: 'divide',
		label: 'Divide',
		description: 'Divide by a value',
		accepts: ['number'],
		args: [{ name: 'Divisor', type: 'number', default: 2 }]
	},
	{
		name: 'round',
		label: 'Round Number',
		description: 'Round to specified decimal places',
		accepts: ['number'],
		args: [{ name: 'Decimals', type: 'number', default: 0 }]
	},
	{
		name: 'ceil',
		label: 'Round Up',
		description: 'Round up to nearest integer',
		accepts: ['number'],
		args: []
	},
	{
		name: 'floor',
		label: 'Round Down',
		description: 'Round down to nearest integer',
		accepts: ['number'],
		args: []
	},

	// DATE
	{
		name: 'date',
		label: 'Format Date',
		description: 'Format date/time values',
		accepts: ['date', 'string'],
		args: [
			{
				name: 'Format',
				type: 'select',
				options: ['iso', 'date', 'time', 'datetime', 'short', 'long', 'full', 'relative', 'yyyy-MM-dd', 'MM/dd/yyyy', 'dd.MM.yyyy', 'MMM do, yyyy'],
				default: 'date'
			}
		]
	},

	// PATH
	{
		name: 'basename',
		label: 'File Name',
		description: 'Extract filename from path (file.jpg)',
		accepts: ['string'],
		args: []
	},
	{
		name: 'extension',
		label: 'File Extension',
		description: 'Get file extension (.jpg)',
		accepts: ['string'],
		args: []
	},
	{
		name: 'dirname',
		label: 'Directory Path',
		description: 'Get directory portion of path',
		accepts: ['string'],
		args: []
	},

	// LOGIC
	{
		name: 'default',
		label: 'Default Value',
		description: 'Use fallback if field is empty',
		accepts: ['any', 'string', 'number', 'date'],
		args: [{ name: 'Fallback', type: 'text', default: 'N/A' }]
	},
	{
		name: 'if',
		label: 'Conditional',
		description: 'Show different text based on condition',
		accepts: ['any'],
		args: [
			{ name: 'If True', type: 'text', default: 'Yes' },
			{ name: 'If False', type: 'text', default: 'No' }
		]
	}
];
