/**
 * @file tests/bun/services/tokens/modifiers.test.ts
 * @description Tests for token modifiers
 */

// @ts-expect-error - Bun test is available at runtime
import { describe, it, expect } from 'bun:test';
import { getModifier, getAllModifiers, applyModifier } from '@src/services/tokens/modifiers';

describe('Modifiers - Text Case', () => {
	it('should convert to uppercase', () => {
		const result = applyModifier('uppercase', 'hello world');
		expect(result).toBe('HELLO WORLD');
	});

	it('should convert to lowercase', () => {
		const result = applyModifier('lowercase', 'HELLO WORLD');
		expect(result).toBe('hello world');
	});

	it('should capitalize words', () => {
		const result = applyModifier('capitalize', 'hello world');
		expect(result).toBe('Hello World');
	});

	it('should handle empty strings', () => {
		expect(applyModifier('uppercase', '')).toBe('');
		expect(applyModifier('lowercase', '')).toBe('');
		expect(applyModifier('capitalize', '')).toBe('');
	});
});

describe('Modifiers - String Formatting', () => {
	it('should trim whitespace', () => {
		const result = applyModifier('trim', '  hello world  ');
		expect(result).toBe('hello world');
	});

	it('should truncate text', () => {
		const text = 'This is a long text that needs truncation';
		const result = applyModifier('truncate', text, ['20']);
		
		expect(result.length).toBeLessThanOrEqual(23); // 20 + "..."
		expect(result).toContain('...');
	});

	it('should truncate with custom suffix', () => {
		const text = 'This is a long text';
		const result = applyModifier('truncate', text, ['10', '…']);
		
		expect(result).toContain('…');
	});

	it('should not truncate if text is shorter than limit', () => {
		const text = 'Short';
		const result = applyModifier('truncate', text, ['10']);
		
		expect(result).toBe('Short');
	});
});

describe('Modifiers - Slug Generation', () => {
	it('should create URL-friendly slug', () => {
		const result = applyModifier('slug', 'Hello World!');
		expect(result).toBe('hello-world');
	});

	it('should handle special characters', () => {
		const result = applyModifier('slug', 'Hello & World @ 2024!');
		expect(result).toBe('hello-world-2024');
	});

	it('should handle multiple spaces', () => {
		const result = applyModifier('slug', 'Hello    World');
		expect(result).toBe('hello-world');
	});

	it('should remove leading/trailing dashes', () => {
		const result = applyModifier('slug', '  Hello World  ');
		expect(result).toBe('hello-world');
	});
});

describe('Modifiers - Case Conversions', () => {
	it('should convert to kebab-case', () => {
		expect(applyModifier('kebabcase', 'helloWorld')).toBe('hello-world');
		expect(applyModifier('kebabcase', 'HelloWorld')).toBe('hello-world');
		expect(applyModifier('kebabcase', 'hello world')).toBe('hello-world');
	});

	it('should convert to snake_case', () => {
		expect(applyModifier('snakecase', 'helloWorld')).toBe('hello_world');
		expect(applyModifier('snakecase', 'HelloWorld')).toBe('hello_world');
		expect(applyModifier('snakecase', 'hello world')).toBe('hello_world');
	});

	it('should convert to camelCase', () => {
		expect(applyModifier('camelcase', 'hello world')).toBe('helloWorld');
		expect(applyModifier('camelcase', 'Hello World')).toBe('helloWorld');
		expect(applyModifier('camelcase', 'hello-world')).toBe('helloWorld');
	});

	it('should convert to PascalCase', () => {
		expect(applyModifier('pascalcase', 'hello world')).toBe('HelloWorld');
		expect(applyModifier('pascalcase', 'hello-world')).toBe('HelloWorld');
	});
});

describe('Modifiers - String Manipulation', () => {
	it('should replace text', () => {
		const result = applyModifier('replace', 'hello world', [' ', '_']);
		expect(result).toBe('hello_world');
	});

	it('should replace all occurrences', () => {
		const result = applyModifier('replace', 'hello hello hello', ['hello', 'hi']);
		expect(result).toBe('hi hi hi');
	});

	it('should append text', () => {
		const result = applyModifier('append', 'hello', [' world']);
		expect(result).toBe('hello world');
	});

	it('should prepend text', () => {
		const result = applyModifier('prepend', 'world', ['hello ']);
		expect(result).toBe('hello world');
	});
});

describe('Modifiers - Default Values', () => {
	it('should use default for empty string', () => {
		const result = applyModifier('default', '', ['fallback']);
		expect(result).toBe('fallback');
	});

	it('should not use default for non-empty string', () => {
		const result = applyModifier('default', 'value', ['fallback']);
		expect(result).toBe('value');
	});

	it('should use default for whitespace-only string', () => {
		const result = applyModifier('default', '   ', ['fallback']);
		expect(result).toBe('fallback');
	});
});

describe('Modifiers - HTML and Encoding', () => {
	it('should strip HTML tags', () => {
		const result = applyModifier('strip', '<p>Hello <strong>World</strong></p>');
		expect(result).toBe('Hello World');
	});

	it('should handle nested HTML', () => {
		const result = applyModifier('strip', '<div><p>Test</p></div>');
		expect(result).toBe('Test');
	});

	it('should URL encode text', () => {
		const result = applyModifier('urlencode', 'hello world?foo=bar');
		expect(result).toBe('hello%20world%3Ffoo%3Dbar');
	});
});

describe('Modifiers - Date Formatting', () => {
	it('should format date with default format', () => {
		const date = new Date('2024-01-15T10:30:00Z');
		const result = applyModifier('date', date);
		
		expect(result).toBe('2024-01-15');
	});

	it('should format date with custom format', () => {
		const date = new Date('2024-01-15T10:30:45Z');
		const result = applyModifier('date', date, ['YYYY-MM-DD HH:mm:ss']);
		
		expect(result).toContain('2024-01-15');
	});

	it('should handle date strings', () => {
		const result = applyModifier('date', '2024-01-15T10:30:00Z');
		expect(result).toBe('2024-01-15');
	});

	it('should handle invalid dates gracefully', () => {
		const result = applyModifier('date', 'invalid date');
		expect(result).toBe('invalid date');
	});
});

describe('Modifiers - Registry', () => {
	it('should get modifier by name', () => {
		const modifier = getModifier('uppercase');
		
		expect(modifier).toBeDefined();
		expect(modifier?.name).toBe('uppercase');
	});

	it('should be case-insensitive', () => {
		const modifier1 = getModifier('UPPERCASE');
		const modifier2 = getModifier('uppercase');
		
		expect(modifier1).toEqual(modifier2);
	});

	it('should return undefined for unknown modifier', () => {
		const modifier = getModifier('nonexistent');
		expect(modifier).toBeUndefined();
	});

	it('should get all modifiers', () => {
		const modifiers = getAllModifiers();
		
		expect(modifiers.length).toBeGreaterThan(0);
		expect(modifiers.every(m => m.name && m.description && m.execute)).toBe(true);
	});

	it('should throw on unknown modifier in applyModifier', () => {
		expect(() => {
			applyModifier('unknownModifier', 'test');
		}).toThrow('Unknown modifier');
	});
});

describe('Modifiers - Type Coercion', () => {
	it('should handle non-string values', () => {
		expect(applyModifier('uppercase', 123)).toBe('123');
		expect(applyModifier('uppercase', true)).toBe('TRUE');
		expect(applyModifier('uppercase', null)).toBe('');
		expect(applyModifier('uppercase', undefined)).toBe('');
	});

	it('should handle objects', () => {
		const result = applyModifier('uppercase', { toString: () => 'test' });
		expect(result).toBe('TEST');
	});
});

describe('Modifiers - Parameters', () => {
	it('should handle modifiers without parameters', () => {
		const result = applyModifier('uppercase', 'test', []);
		expect(result).toBe('TEST');
	});

	it('should handle modifiers with multiple parameters', () => {
		const result = applyModifier('replace', 'hello world', ['hello', 'hi']);
		expect(result).toBe('hi world');
	});

	it('should handle missing optional parameters', () => {
		const result = applyModifier('truncate', 'test');
		expect(result).toBe('test'); // Default length is 50
	});
});

describe('Modifiers - Edge Cases', () => {
	it('should handle very long strings', () => {
		const longString = 'a'.repeat(10000);
		const result = applyModifier('uppercase', longString);
		expect(result.length).toBe(10000);
		expect(result).toBe('A'.repeat(10000));
	});

	it('should handle unicode characters', () => {
		const result = applyModifier('uppercase', 'héllo wörld');
		expect(result).toBe('HÉLLO WÖRLD');
	});

	it('should handle emojis', () => {
		const result = applyModifier('uppercase', 'hello 👋 world');
		expect(result).toBe('HELLO 👋 WORLD');
	});

	it('should handle empty parameters array', () => {
		const result = applyModifier('default', '', []);
		expect(result).toBe('');
	});
});
