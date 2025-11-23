/*
 * @file src/services/token/modifiers.ts
 * @description Comprehensive library of token modifiers.
 *
 * @param {ModifierFunction} modifierRegistry - The modifier registry.
 * @returns {ModifierFunction[]} The modifier registry.
 *
 * Features:
 * - Resolves tokens in JSON API responses.
 * - Only processes JSON API responses for collection endpoints.
 * - Clones response body to avoid modifying the original response.
 * - Processes the response body with tokens.
 * - Returns the processed response.
 */

import type { ModifierFunction } from './types';
import { formatDateString } from '@utils/dateUtils'; // Assumes utility exists

export const modifierRegistry = new Map<string, ModifierFunction>();

const modifiers: Record<string, ModifierFunction> = {
	// --- Text Manipulation ---
	upper: (v) => String(v ?? '').toUpperCase(),
	lower: (v) => String(v ?? '').toLowerCase(),
	capitalize: (v) => String(v ?? '').replace(/\b\w/g, (c) => c.toUpperCase()),
	trim: (v) => String(v ?? '').trim(),
	slug: (v) =>
		String(v ?? '')
			.toLowerCase()
			.trim()
			.replace(/[^\w\s-]/g, '')
			.replace(/[\s_-]+/g, '-')
			.replace(/^-+|-+$/g, ''),
	kebabcase: (v) =>
		String(v ?? '')
			.replace(/([a-z])([A-Z])/g, '$1-$2')
			.replace(/[\s_]+/g, '-')
			.toLowerCase(),
	snakecase: (v) =>
		String(v ?? '')
			.replace(/([a-z])([A-Z])/g, '$1_$2')
			.replace(/[\s-]+/g, '_')
			.toLowerCase(),
	camelcase: (v) =>
		String(v ?? '')
			.toLowerCase()
			.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase()),
	truncate: (v, args) => {
		const str = String(v ?? '');
		const len = parseInt(args?.[0] || '50');
		const suffix = args?.[1] ?? '...';
		return str.length > len ? str.substring(0, len) + suffix : str;
	},
	strip: (v) => String(v ?? '').replace(/<[^>]*>/g, ''), // Strip HTML
	urlencode: (v) => encodeURIComponent(String(v ?? '')),
	replace: (v, args) => {
		const pattern = args?.[0] ?? '';
		const replacement = args?.[1] ?? '';
		return String(v ?? '').replace(new RegExp(pattern, 'g'), replacement);
	},
	append: (v, args) => String(v ?? '') + (args?.[0] ?? ''),
	prepend: (v, args) => (args?.[0] ?? '') + String(v ?? ''),

	// --- Logic & Comparison ---
	// Syntax: {{ value | if:'TrueVal':'FalseVal' }}
	if: (v, args) => {
		const isTruthy = v && v !== 'false' && v !== '';
		return isTruthy ? (args?.[0] ?? '') : (args?.[1] ?? '');
	},
	eq: (v, args) => (String(v) === String(args?.[0] ?? '') ? 'true' : ''),
	ne: (v, args) => (String(v) !== String(args?.[0] ?? '') ? 'true' : ''),
	gt: (v, args) => (parseFloat(String(v)) > parseFloat(args?.[0] ?? '0') ? 'true' : ''),
	lt: (v, args) => (parseFloat(String(v)) < parseFloat(args?.[0] ?? '0') ? 'true' : ''),
	default: (v, args) => (!v || v === '' ? (args?.[0] ?? '') : String(v)),

	// --- Date ---
	date: (v, args) => {
		if (!v) return '';
		return formatDateString(v as string | Date, args?.[0] || 'yyyy-MM-dd', '');
	},

	// --- Math ---
	add: (v, args) => String(parseFloat(String(v)) + parseFloat(args?.[0] || '0')),
	subtract: (v, args) => String(parseFloat(String(v)) - parseFloat(args?.[0] || '0')),
	multiply: (v, args) => String(parseFloat(String(v)) * parseFloat(args?.[0] || '1')),
	divide: (v, args) => {
		const div = parseFloat(args?.[0] || '1');
		return div === 0 ? 'NaN' : String(parseFloat(String(v)) / div);
	},

	// --- Security ---
	escape: (v) =>
		String(v ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;'),

	// --- CMS Specific ---
	image_style: (v, args) => {
		if (!v) return '';
		const style = args?.[0] || 'original';
		return `/api/media/${v}?style=${style}`;
	}
};

// Register all modifiers (case-insensitive keys)
Object.entries(modifiers).forEach(([k, v]) => {
	modifierRegistry.set(k.toLowerCase(), v);
});
