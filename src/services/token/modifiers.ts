/**
 * @file src/services/token/modifiers.ts
 * @description Modifiers with UI Metadata for the Token Builder.
 */
import type { ModifierFunction, ModifierMetadata } from './types';
import { formatDateString } from '@utils/dateUtils';

export const modifierRegistry = new Map<string, ModifierFunction>();

// 1. Execution Logic
const functions: Record<string, ModifierFunction> = {
	// Text
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
		const len = parseInt(args?.[0] || '50');
		const s = String(v ?? '');
		return s.length > len ? s.substring(0, len) + (args?.[1] ?? '...') : s;
	},

	// Date
	date: (v, args) => {
		if (!v) return '';
		return formatDateString(v as string | Date, args?.[0] || 'yyyy-MM-dd', '');
	},

	// Math
	add: (v, args) => String(parseFloat(String(v)) + parseFloat(args?.[0] || '0')),
	subtract: (v, args) => String(parseFloat(String(v)) - parseFloat(args?.[0] || '0')),
	multiply: (v, args) => String(parseFloat(String(v)) * parseFloat(args?.[0] || '1')),

	// Logic
	default: (v, args) => (!v || v === '' ? (args?.[0] ?? '') : String(v)),
	if: (v, args) => (v && v !== 'false' ? (args?.[0] ?? '') : (args?.[1] ?? '')),
	eq: (v, args) => (String(v) === String(args?.[0]) ? 'true' : 'false'),
	ne: (v, args) => (String(v) !== String(args?.[0]) ? 'true' : 'false'),
	gt: (v, args) => (parseFloat(String(v)) > parseFloat(args?.[0] || '0') ? 'true' : 'false'),
	lt: (v, args) => (parseFloat(String(v)) < parseFloat(args?.[0] || '0') ? 'true' : 'false')
};

// Register Execution Logic
Object.entries(functions).forEach(([k, v]) => modifierRegistry.set(k, v));

// 2. UI Metadata (The Brains for the Picker)
export const modifierMetadata: ModifierMetadata[] = [
	{
		name: 'date',
		label: 'Format Date',
		description: 'Change how the date looks',
		accepts: ['date', 'string'],
		args: [
			{
				name: 'Format',
				type: 'select',
				options: ['yyyy-MM-dd', 'MM/dd/yyyy', 'dd.MM.yyyy', 'MMM do, yyyy', 'yyyy'],
				default: 'yyyy-MM-dd'
			}
		]
	},
	{
		name: 'upper',
		label: 'Uppercase',
		description: 'CONVERT TO UPPERCASE',
		accepts: ['string'],
		args: []
	},
	{
		name: 'truncate',
		label: 'Truncate Text',
		description: 'Shorten text if it gets too long',
		accepts: ['string'],
		args: [
			{ name: 'Length', type: 'number', default: 50 },
			{ name: 'Suffix', type: 'text', default: '...' }
		]
	},
	{
		name: 'add',
		label: 'Add Number',
		description: 'Add a value to this number',
		accepts: ['number'],
		args: [{ name: 'Value', type: 'number', default: 1 }]
	},
	{
		name: 'default',
		label: 'Default Value',
		description: 'Show this if the field is empty',
		accepts: ['any', 'string', 'number', 'date'],
		args: [{ name: 'Fallback', type: 'text', default: 'N/A' }]
	}
];
