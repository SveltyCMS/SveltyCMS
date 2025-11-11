/**
 * @file tests/bun/services/tokens/TokenService.test.ts
 * @description Tests for the token replacement service
 */

// @ts-expect-error - Bun test is available at runtime
import { describe, it, expect, beforeEach } from 'bun:test';
import { replaceTokens, hasTokens, extractTokens, validateTokenSyntax } from '@src/services/tokens/TokenService';
import type { TokenContext } from '@src/services/tokens/types';

describe('TokenService - Basic Token Replacement', () => {
	let context: TokenContext;

	beforeEach(() => {
		context = {
			entry: {
				title: 'Test Article',
				description: 'This is a test description',
				status: 'publish'
			},
			user: {
				name: 'John Doe',
				email: 'john@example.com',
				role: 'editor'
			},
			siteConfig: {
				name: 'My Test Site',
				tagline: 'A great site'
			}
		};
	});

	it('should replace simple entry tokens', () => {
		const result = replaceTokens('Title: {{entry.title}}', context);
		
		expect(result.result).toBe('Title: Test Article');
		expect(result.replaced).toContain('entry.title');
		expect(result.unresolved.length).toBe(0);
		expect(result.errors.length).toBe(0);
	});

	it('should replace multiple tokens in one string', () => {
		const result = replaceTokens(
			'{{entry.title}} by {{user.name}} on {{site.name}}',
			context
		);
		
		expect(result.result).toBe('Test Article by John Doe on My Test Site');
		expect(result.replaced).toContain('entry.title');
		expect(result.replaced).toContain('user.name');
		expect(result.replaced).toContain('site.name');
	});

	it('should replace user tokens', () => {
		const result = replaceTokens('User: {{user.name}} <{{user.email}}>', context);
		
		expect(result.result).toBe('User: John Doe <john@example.com>');
	});

	it('should replace site config tokens', () => {
		const result = replaceTokens('Welcome to {{site.name}} - {{site.tagline}}', context);
		
		expect(result.result).toBe('Welcome to My Test Site - A great site');
	});
});

describe('TokenService - Nested Data Access', () => {
	let context: TokenContext;

	beforeEach(() => {
		context = {
			entry: {
				author: {
					name: 'Jane Smith',
					bio: {
						text: 'Expert writer'
					}
				}
			}
		};
	});

	it('should access nested properties', () => {
		const result = replaceTokens('{{entry.author.name}}', context);
		
		expect(result.result).toBe('Jane Smith');
	});

	it('should access deeply nested properties', () => {
		const result = replaceTokens('{{entry.author.bio.text}}', context);
		
		expect(result.result).toBe('Expert writer');
	});

	it('should handle missing nested properties gracefully', () => {
		const result = replaceTokens('{{entry.author.missing.property}}', context);
		
		expect(result.result).toBe('');
		expect(result.unresolved).toContain('entry.author.missing.property');
	});
});

describe('TokenService - Modifiers', () => {
	let context: TokenContext;

	beforeEach(() => {
		context = {
			entry: {
				title: 'hello world',
				description: 'This is a very long description that needs to be truncated for display purposes'
			}
		};
	});

	it('should apply uppercase modifier', () => {
		const result = replaceTokens('{{entry.title|uppercase}}', context);
		
		expect(result.result).toBe('HELLO WORLD');
	});

	it('should apply lowercase modifier', () => {
		const result = replaceTokens('{{entry.title|lowercase}}', context);
		
		expect(result.result).toBe('hello world');
	});

	it('should apply capitalize modifier', () => {
		const result = replaceTokens('{{entry.title|capitalize}}', context);
		
		expect(result.result).toBe('Hello World');
	});

	it('should apply slug modifier', () => {
		const result = replaceTokens('{{entry.title|slug}}', context);
		
		expect(result.result).toBe('hello-world');
	});

	it('should apply truncate modifier with length parameter', () => {
		const result = replaceTokens('{{entry.description|truncate:20}}', context);
		
		expect(result.result).toBe('This is a very long ...');
		expect(result.result.length).toBeLessThanOrEqual(23); // 20 + "..."
	});

	it('should chain multiple modifiers', () => {
		const result = replaceTokens('{{entry.title|uppercase|slug}}', context);
		
		expect(result.result).toBe('hello-world'); // slug lowercases after uppercase
	});

	it('should apply prepend modifier', () => {
		const result = replaceTokens('{{entry.title|prepend:"Article: "}}', context);
		
		expect(result.result).toBe('Article: hello world');
	});

	it('should apply append modifier', () => {
		const result = replaceTokens('{{entry.title|append:" - My Site"}}', context);
		
		expect(result.result).toBe('hello world - My Site');
	});

	it('should apply default modifier for empty values', () => {
		const emptyContext: TokenContext = {
			entry: { subtitle: '' }
		};
		const result = replaceTokens('{{entry.subtitle|default:"No subtitle"}}', emptyContext);
		
		expect(result.result).toBe('No subtitle');
	});

	it('should not apply default modifier for non-empty values', () => {
		const result = replaceTokens('{{entry.title|default:"No title"}}', context);
		
		expect(result.result).toBe('hello world');
	});
});

describe('TokenService - System Tokens', () => {
	it('should replace system.now token', () => {
		const result = replaceTokens('Current time: {{system.now}}', {});
		
		expect(result.result).toContain('Current time:');
		expect(result.replaced).toContain('system.now');
		// Should be ISO format
		expect(result.result).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
	});

	it('should replace system.timestamp token', () => {
		const result = replaceTokens('Timestamp: {{system.timestamp}}', {});
		
		expect(result.result).toContain('Timestamp:');
		expect(result.replaced).toContain('system.timestamp');
		// Should be numeric timestamp
		expect(result.result).toMatch(/Timestamp: \d+/);
	});

	it('should replace system.year token', () => {
		const result = replaceTokens('Year: {{system.year}}', {});
		const currentYear = new Date().getFullYear();
		
		expect(result.result).toBe(`Year: ${currentYear}`);
	});

	it('should replace system.language token', () => {
		const result = replaceTokens('Language: {{system.language}}', { contentLanguage: 'fr' });
		
		expect(result.result).toBe('Language: fr');
	});

	it('should default to en for system.language', () => {
		const result = replaceTokens('Language: {{system.language}}', {});
		
		expect(result.result).toBe('Language: en');
	});
});

describe('TokenService - Error Handling', () => {
	it('should handle undefined tokens gracefully', () => {
		const result = replaceTokens('{{entry.missing}}', {});
		
		expect(result.result).toBe('');
		expect(result.unresolved).toContain('entry.missing');
		expect(result.errors.length).toBe(0);
	});

	it('should preserve unresolved tokens when option is set', () => {
		const result = replaceTokens(
			'{{entry.missing}}',
			{},
			{ preserveUnresolved: true }
		);
		
		expect(result.result).toBe('{{entry.missing}}');
	});

	it('should throw on missing tokens when option is set', () => {
		expect(() => {
			replaceTokens('{{entry.missing}}', {}, { throwOnMissing: true });
		}).toThrow();
	});

	it('should handle unknown modifiers gracefully', () => {
		const result = replaceTokens(
			'{{entry.title|unknownModifier}}',
			{ entry: { title: 'test' } }
		);
		
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0].message).toContain('Unknown modifier');
	});

	it('should call error handler when provided', () => {
		let errorCalled = false;
		let errorToken = '';
		
		replaceTokens(
			'{{entry.missing}}',
			{},
			{
				onError: (error, token) => {
					errorCalled = true;
					errorToken = token;
				}
			}
		);
		
		// No error should be called for missing tokens
		expect(errorCalled).toBe(false);
	});

	it('should handle null and undefined context values', () => {
		const context: TokenContext = {
			entry: {
				title: null,
				description: undefined
			}
		};
		
		const result = replaceTokens('{{entry.title}} {{entry.description}}', context);
		
		expect(result.result).toBe(' ');
	});
});

describe('TokenService - Helper Functions', () => {
	it('should detect tokens in string', () => {
		expect(hasTokens('Hello {{entry.title}}')).toBe(true);
		expect(hasTokens('Hello world')).toBe(false);
		expect(hasTokens('{{user.name}} and {{site.name}}')).toBe(true);
	});

	it('should extract all tokens from string', () => {
		const tokens = extractTokens('{{entry.title}} by {{user.name}} on {{site.name}}');
		
		expect(tokens).toHaveLength(3);
		expect(tokens).toContain('entry.title');
		expect(tokens).toContain('user.name');
		expect(tokens).toContain('site.name');
	});

	it('should extract tokens with modifiers', () => {
		const tokens = extractTokens('{{entry.title|uppercase|slug}}');
		
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toBe('entry.title|uppercase|slug');
	});

	it('should validate token syntax', () => {
		expect(validateTokenSyntax('entry.title').valid).toBe(true);
		expect(validateTokenSyntax('entry.title|uppercase').valid).toBe(true);
		expect(validateTokenSyntax('entry.title|truncate:50').valid).toBe(true);
	});
});

describe('TokenService - Advanced Use Cases', () => {
	it('should handle SEO meta title use case', () => {
		const context: TokenContext = {
			entry: { title: 'My Article' },
			siteConfig: { name: 'My Blog' }
		};
		
		const result = replaceTokens('{{entry.title}} | {{site.name}}', context);
		
		expect(result.result).toBe('My Article | My Blog');
	});

	it('should handle URL slug generation use case', () => {
		const context: TokenContext = {
			entry: { title: 'How to Build a CMS in 2024' }
		};
		
		const result = replaceTokens('{{entry.title|slug}}', context);
		
		expect(result.result).toBe('how-to-build-a-cms-in-2024');
	});

	it('should handle email template use case', () => {
		const context: TokenContext = {
			user: { name: 'Alice', email: 'alice@example.com' },
			entry: { title: 'New Article Published' }
		};
		
		const template = 'Hi {{user.name}}, a new article "{{entry.title}}" was published!';
		const result = replaceTokens(template, context);
		
		expect(result.result).toBe('Hi Alice, a new article "New Article Published" was published!');
	});

	it('should handle complex chained modifiers', () => {
		const context: TokenContext = {
			entry: { title: '  Hello World  ' }
		};
		
		const result = replaceTokens('{{entry.title|trim|uppercase|append:"!!!"}}', context);
		
		expect(result.result).toBe('HELLO WORLD!!!');
	});

	it('should prevent infinite loops with max depth', () => {
		const result = replaceTokens(
			'{{entry.title}}',
			{ entry: { title: '{{entry.title}}' } },
			{ maxDepth: 5 }
		);
		
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors.some(e => e.message.includes('Maximum replacement depth'))).toBe(true);
	});
});
