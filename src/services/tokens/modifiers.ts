/**
 * @file src/services/tokens/modifiers.ts
 * @description Built-in token modifiers for text transformation
 * 
 * Modifiers are functions that transform token values (e.g., {{entry.title|uppercase}})
 */

import type { ModifierDefinition } from './types';

/**
 * Registry of built-in modifiers
 */
export const builtInModifiers: Record<string, ModifierDefinition> = {
	uppercase: {
		name: 'uppercase',
		description: 'Converts text to uppercase',
		execute: (value: unknown): string => {
			return String(value ?? '').toUpperCase();
		},
		example: '{{entry.title|uppercase}}'
	},

	lowercase: {
		name: 'lowercase',
		description: 'Converts text to lowercase',
		execute: (value: unknown): string => {
			return String(value ?? '').toLowerCase();
		},
		example: '{{entry.title|lowercase}}'
	},

	capitalize: {
		name: 'capitalize',
		description: 'Capitalizes the first letter of each word',
		execute: (value: unknown): string => {
			const str = String(value ?? '');
			return str.replace(/\b\w/g, (char) => char.toUpperCase());
		},
		example: '{{entry.title|capitalize}}'
	},

	trim: {
		name: 'trim',
		description: 'Removes whitespace from both ends',
		execute: (value: unknown): string => {
			return String(value ?? '').trim();
		},
		example: '{{entry.title|trim}}'
	},

	truncate: {
		name: 'truncate',
		description: 'Truncates text to specified length',
		execute: (value: unknown, params?: string[]): string => {
			const str = String(value ?? '');
			const length = params?.[0] ? parseInt(params[0], 10) : 50;
			const suffix = params?.[1] ?? '...';
			
			if (str.length <= length) return str;
			return str.slice(0, length) + suffix;
		},
		parameters: [
			{
				name: 'length',
				description: 'Maximum length',
				required: false,
				type: 'number'
			},
			{
				name: 'suffix',
				description: 'Suffix to append (default: "...")',
				required: false,
				type: 'string'
			}
		],
		example: '{{entry.description|truncate:100}}'
	},

	slug: {
		name: 'slug',
		description: 'Converts text to URL-friendly slug',
		execute: (value: unknown): string => {
			return String(value ?? '')
				.toLowerCase()
				.trim()
				.replace(/[\s_]+/g, '-')
				.replace(/[^\w\-]+/g, '')
				.replace(/\-\-+/g, '-')
				.replace(/^-+/, '')
				.replace(/-+$/, '');
		},
		example: '{{entry.title|slug}}'
	},

	kebabcase: {
		name: 'kebabcase',
		description: 'Converts text to kebab-case',
		execute: (value: unknown): string => {
			return String(value ?? '')
				.replace(/([a-z])([A-Z])/g, '$1-$2')
				.replace(/[\s_]+/g, '-')
				.toLowerCase();
		},
		example: '{{entry.title|kebabcase}}'
	},

	snakecase: {
		name: 'snakecase',
		description: 'Converts text to snake_case',
		execute: (value: unknown): string => {
			return String(value ?? '')
				.replace(/([a-z])([A-Z])/g, '$1_$2')
				.replace(/[\s-]+/g, '_')
				.toLowerCase();
		},
		example: '{{entry.title|snakecase}}'
	},

	camelcase: {
		name: 'camelcase',
		description: 'Converts text to camelCase',
		execute: (value: unknown): string => {
			const str = String(value ?? '')
				.toLowerCase()
				.replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase());
			return str.charAt(0).toLowerCase() + str.slice(1);
		},
		example: '{{entry.title|camelcase}}'
	},

	pascalcase: {
		name: 'pascalcase',
		description: 'Converts text to PascalCase',
		execute: (value: unknown): string => {
			const str = String(value ?? '')
				.toLowerCase()
				.replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase());
			return str.charAt(0).toUpperCase() + str.slice(1);
		},
		example: '{{entry.title|pascalcase}}'
	},

	replace: {
		name: 'replace',
		description: 'Replaces occurrences of a pattern',
		execute: (value: unknown, params?: string[]): string => {
			const str = String(value ?? '');
			const pattern = params?.[0] ?? '';
			const replacement = params?.[1] ?? '';
			
			return str.replace(new RegExp(pattern, 'g'), replacement);
		},
		parameters: [
			{
				name: 'pattern',
				description: 'Text or regex pattern to find',
				required: true,
				type: 'string'
			},
			{
				name: 'replacement',
				description: 'Replacement text',
				required: true,
				type: 'string'
			}
		],
		example: '{{entry.title|replace:" ":"_"}}'
	},

	default: {
		name: 'default',
		description: 'Provides a default value if empty',
		execute: (value: unknown, params?: string[]): string => {
			const str = String(value ?? '').trim();
			const defaultValue = params?.[0] ?? '';
			
			return str || defaultValue;
		},
		parameters: [
			{
				name: 'defaultValue',
				description: 'Value to use if empty',
				required: true,
				type: 'string'
			}
		],
		example: '{{entry.subtitle|default:"No subtitle"}}'
	},

	append: {
		name: 'append',
		description: 'Appends text to the value',
		execute: (value: unknown, params?: string[]): string => {
			const str = String(value ?? '');
			const suffix = params?.[0] ?? '';
			
			return str + suffix;
		},
		parameters: [
			{
				name: 'text',
				description: 'Text to append',
				required: true,
				type: 'string'
			}
		],
		example: '{{entry.title|append:" - My Site"}}'
	},

	prepend: {
		name: 'prepend',
		description: 'Prepends text to the value',
		execute: (value: unknown, params?: string[]): string => {
			const str = String(value ?? '');
			const prefix = params?.[0] ?? '';
			
			return prefix + str;
		},
		parameters: [
			{
				name: 'text',
				description: 'Text to prepend',
				required: true,
				type: 'string'
			}
		],
		example: '{{entry.title|prepend:"Article: "}}'
	},

	strip: {
		name: 'strip',
		description: 'Removes HTML tags from text',
		execute: (value: unknown): string => {
			return String(value ?? '').replace(/<[^>]*>/g, '');
		},
		example: '{{entry.content|strip}}'
	},

	urlencode: {
		name: 'urlencode',
		description: 'URL encodes the value',
		execute: (value: unknown): string => {
			return encodeURIComponent(String(value ?? ''));
		},
		example: '{{entry.title|urlencode}}'
	},

	date: {
		name: 'date',
		description: 'Formats a date value',
		execute: (value: unknown, params?: string[]): string => {
			const dateValue = value instanceof Date ? value : new Date(String(value ?? ''));
			
			if (isNaN(dateValue.getTime())) {
				return String(value ?? '');
			}
			
			const format = params?.[0] ?? 'YYYY-MM-DD';
			
			// Simple date formatting (can be enhanced with date-fns or similar)
			const year = dateValue.getFullYear();
			const month = String(dateValue.getMonth() + 1).padStart(2, '0');
			const day = String(dateValue.getDate()).padStart(2, '0');
			const hours = String(dateValue.getHours()).padStart(2, '0');
			const minutes = String(dateValue.getMinutes()).padStart(2, '0');
			const seconds = String(dateValue.getSeconds()).padStart(2, '0');
			
			return format
				.replace('YYYY', String(year))
				.replace('MM', month)
				.replace('DD', day)
				.replace('HH', hours)
				.replace('mm', minutes)
				.replace('ss', seconds);
		},
		parameters: [
			{
				name: 'format',
				description: 'Date format pattern (YYYY-MM-DD, etc.)',
				required: false,
				type: 'string'
			}
		],
		example: '{{entry.publishedAt|date:"YYYY-MM-DD"}}'
	}
};

/**
 * Get a modifier by name
 */
export function getModifier(name: string): ModifierDefinition | undefined {
	return builtInModifiers[name.toLowerCase()];
}

/**
 * Get all available modifiers
 */
export function getAllModifiers(): ModifierDefinition[] {
	return Object.values(builtInModifiers);
}

/**
 * Apply a modifier to a value
 */
export function applyModifier(modifierName: string, value: unknown, params?: string[]): string {
	const modifier = getModifier(modifierName);
	
	if (!modifier) {
		throw new Error(`Unknown modifier: ${modifierName}`);
	}
	
	return modifier.execute(value, params);
}
