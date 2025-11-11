/**
 * @file tests/bun/services/tokens/TokenRegistry.test.ts
 * @description Tests for the token registry and discovery service
 */

// @ts-expect-error - Bun test is available at runtime
import { describe, it, expect, beforeEach } from 'bun:test';
import { getAvailableTokens, getTokensByScope, findToken } from '@src/services/tokens/TokenRegistry';
import type { TokenContext, TokenDefinition } from '@src/services/tokens/types';
import type { Schema } from '@src/content/types';

describe('TokenRegistry - System Tokens', () => {
	it('should return system tokens', () => {
		const tokens = getAvailableTokens({}, { scope: 'system' });
		
		expect(tokens.length).toBeGreaterThan(0);
		expect(tokens.some(t => t.key === 'system.now')).toBe(true);
		expect(tokens.some(t => t.key === 'system.year')).toBe(true);
		expect(tokens.some(t => t.key === 'system.timestamp')).toBe(true);
		expect(tokens.some(t => t.key === 'system.language')).toBe(true);
	});

	it('should mark all system tokens as available', () => {
		const tokens = getAvailableTokens({}, { scope: 'system' });
		
		tokens.forEach(token => {
			expect(token.available).toBe(true);
		});
	});

	it('should provide preview values for system tokens', () => {
		const tokens = getAvailableTokens({}, { scope: 'system' });
		
		tokens.forEach(token => {
			expect(token.previewValue).toBeDefined();
		});
	});
});

describe('TokenRegistry - User Tokens', () => {
	it('should return user tokens when user context is provided', () => {
		const context: TokenContext = {
			user: {
				id: '123',
				name: 'John Doe',
				email: 'john@example.com',
				role: 'editor'
			}
		};
		
		const tokens = getAvailableTokens(context, { scope: 'user' });
		
		expect(tokens.length).toBeGreaterThan(0);
		expect(tokens.some(t => t.key === 'user.id')).toBe(true);
		expect(tokens.some(t => t.key === 'user.name')).toBe(true);
		expect(tokens.some(t => t.key === 'user.email')).toBe(true);
		expect(tokens.some(t => t.key === 'user.role')).toBe(true);
	});

	it('should mark user tokens as available only when data exists', () => {
		const context: TokenContext = {
			user: {
				name: 'John Doe'
				// No email, id, or role
			}
		};
		
		const tokens = getAvailableTokens(context, { scope: 'user' });
		
		const nameToken = tokens.find(t => t.key === 'user.name');
		const emailToken = tokens.find(t => t.key === 'user.email');
		
		expect(nameToken?.available).toBe(true);
		expect(emailToken?.available).toBe(false);
	});

	it('should include custom user properties', () => {
		const context: TokenContext = {
			user: {
				name: 'John',
				customField: 'custom value'
			}
		};
		
		const tokens = getAvailableTokens(context, { scope: 'user' });
		
		expect(tokens.some(t => t.key === 'user.customField')).toBe(true);
	});

	it('should set preview values from user data', () => {
		const context: TokenContext = {
			user: {
				name: 'Jane Smith',
				email: 'jane@example.com'
			}
		};
		
		const tokens = getAvailableTokens(context, { scope: 'user' });
		
		const nameToken = tokens.find(t => t.key === 'user.name');
		expect(nameToken?.previewValue).toBe('Jane Smith');
	});
});

describe('TokenRegistry - Site Config Tokens', () => {
	it('should return site config tokens', () => {
		const context: TokenContext = {
			siteConfig: {
				name: 'My Site',
				tagline: 'A great site',
				url: 'https://example.com'
			}
		};
		
		const tokens = getAvailableTokens(context, { scope: 'site' });
		
		expect(tokens.some(t => t.key === 'site.name')).toBe(true);
		expect(tokens.some(t => t.key === 'site.tagline')).toBe(true);
		expect(tokens.some(t => t.key === 'site.url')).toBe(true);
	});

	it('should handle nested config properties', () => {
		const context: TokenContext = {
			siteConfig: {
				social: {
					twitter: '@mysite',
					facebook: 'mysite'
				}
			}
		};
		
		const tokens = getAvailableTokens(context, { scope: 'site' });
		
		expect(tokens.some(t => t.key === 'site.social.twitter')).toBe(true);
		expect(tokens.some(t => t.key === 'site.social.facebook')).toBe(true);
	});

	it('should set preview values from site config', () => {
		const context: TokenContext = {
			siteConfig: {
				name: 'Test Site'
			}
		};
		
		const tokens = getAvailableTokens(context, { scope: 'site' });
		const nameToken = tokens.find(t => t.key === 'site.name');
		
		expect(nameToken?.previewValue).toBe('Test Site');
	});
});

describe('TokenRegistry - Collection Tokens', () => {
	it('should return collection metadata tokens', () => {
		const context: TokenContext = {
			collection: {
				name: 'posts',
				label: 'Blog Posts',
				slug: 'posts',
				description: 'All blog posts',
				fields: []
			} as Schema
		};
		
		const tokens = getAvailableTokens(context, { scope: 'collection' });
		
		expect(tokens.some(t => t.key === 'collection.name')).toBe(true);
		expect(tokens.some(t => t.key === 'collection.label')).toBe(true);
		expect(tokens.some(t => t.key === 'collection.slug')).toBe(true);
		expect(tokens.some(t => t.key === 'collection.description')).toBe(true);
	});

	it('should set preview values from collection data', () => {
		const context: TokenContext = {
			collection: {
				name: 'articles',
				label: 'Articles',
				fields: []
			} as Schema
		};
		
		const tokens = getAvailableTokens(context, { scope: 'collection' });
		const nameToken = tokens.find(t => t.key === 'collection.name');
		
		expect(nameToken?.previewValue).toBe('articles');
	});
});

describe('TokenRegistry - Entry Tokens', () => {
	it('should return common entry metadata tokens', () => {
		const context: TokenContext = {
			collection: {
				fields: []
			} as Schema
		};
		
		const tokens = getAvailableTokens(context, { scope: 'entry' });
		
		expect(tokens.some(t => t.key === 'entry._id')).toBe(true);
		expect(tokens.some(t => t.key === 'entry.status')).toBe(true);
		expect(tokens.some(t => t.key === 'entry.createdAt')).toBe(true);
		expect(tokens.some(t => t.key === 'entry.updatedAt')).toBe(true);
		expect(tokens.some(t => t.key === 'entry.createdBy')).toBe(true);
		expect(tokens.some(t => t.key === 'entry.updatedBy')).toBe(true);
	});

	it('should return tokens for collection fields', () => {
		const context: TokenContext = {
			collection: {
				fields: [
					{
						db_fieldName: 'title',
						label: 'Title',
						helper: 'The article title',
						widget: {} as any,
						translated: false,
						required: true
					},
					{
						db_fieldName: 'content',
						label: 'Content',
						widget: {} as any,
						translated: false,
						required: false
					}
				]
			} as Schema
		};
		
		const tokens = getAvailableTokens(context, { scope: 'entry' });
		
		expect(tokens.some(t => t.key === 'entry.title')).toBe(true);
		expect(tokens.some(t => t.key === 'entry.content')).toBe(true);
	});

	it('should include field metadata in token definition', () => {
		const titleField = {
			db_fieldName: 'title',
			label: 'Article Title',
			helper: 'The main title',
			widget: {} as any,
			translated: false,
			required: true
		};
		
		const context: TokenContext = {
			collection: {
				fields: [titleField]
			} as Schema
		};
		
		const tokens = getAvailableTokens(context, { scope: 'entry' });
		const titleToken = tokens.find(t => t.key === 'entry.title');
		
		expect(titleToken?.label).toBe('Article Title');
		expect(titleToken?.description).toBe('The main title');
		expect(titleToken?.field).toBeDefined();
	});
});

describe('TokenRegistry - Multiple Scopes', () => {
	it('should return tokens from multiple scopes', () => {
		const context: TokenContext = {
			user: { name: 'John' },
			siteConfig: { name: 'My Site' }
		};
		
		const tokens = getAvailableTokens(context, { scope: ['user', 'site'] });
		
		expect(tokens.some(t => t.scope === 'user')).toBe(true);
		expect(tokens.some(t => t.scope === 'site')).toBe(true);
		expect(tokens.some(t => t.scope === 'system')).toBe(false);
	});

	it('should return all scopes when no scope filter is provided', () => {
		const context: TokenContext = {
			user: { name: 'John' },
			siteConfig: { name: 'My Site' },
			collection: { name: 'posts', fields: [] } as Schema
		};
		
		const tokens = getAvailableTokens(context);
		
		expect(tokens.some(t => t.scope === 'user')).toBe(true);
		expect(tokens.some(t => t.scope === 'site')).toBe(true);
		expect(tokens.some(t => t.scope === 'collection')).toBe(true);
		expect(tokens.some(t => t.scope === 'entry')).toBe(true);
		expect(tokens.some(t => t.scope === 'system')).toBe(true);
	});
});

describe('TokenRegistry - Filtering and Search', () => {
	it('should filter tokens by search query', () => {
		const context: TokenContext = {
			user: { name: 'John' },
			siteConfig: { name: 'My Site', tagline: 'Great' }
		};
		
		const tokens = getAvailableTokens(context, { search: 'name' });
		
		expect(tokens.every(t => 
			t.key.includes('name') || 
			t.label.toLowerCase().includes('name') ||
			t.description?.toLowerCase().includes('name')
		)).toBe(true);
	});

	it('should be case-insensitive in search', () => {
		const context: TokenContext = {
			user: { name: 'John' }
		};
		
		const tokensLower = getAvailableTokens(context, { search: 'user' });
		const tokensUpper = getAvailableTokens(context, { search: 'USER' });
		
		expect(tokensLower.length).toBe(tokensUpper.length);
	});

	it('should exclude system tokens when includeSystem is false', () => {
		const tokens = getAvailableTokens({}, { includeSystem: false });
		
		expect(tokens.every(t => t.scope !== 'system')).toBe(true);
	});
});

describe('TokenRegistry - Grouped Tokens', () => {
	it('should group tokens by scope', () => {
		const context: TokenContext = {
			user: { name: 'John' },
			siteConfig: { name: 'Site' }
		};
		
		const grouped = getTokensByScope(context);
		
		expect(grouped.user).toBeDefined();
		expect(grouped.site).toBeDefined();
		expect(grouped.entry).toBeDefined();
		expect(grouped.collection).toBeDefined();
		expect(grouped.system).toBeDefined();
	});

	it('should return empty arrays for scopes with no tokens', () => {
		const context: TokenContext = {};
		
		const grouped = getTokensByScope(context);
		
		expect(Array.isArray(grouped.entry)).toBe(true);
		expect(grouped.entry.length).toBe(0);
	});
});

describe('TokenRegistry - Find Token', () => {
	it('should find a specific token by key', () => {
		const context: TokenContext = {
			user: { name: 'John' }
		};
		
		const token = findToken('user.name', context);
		
		expect(token).toBeDefined();
		expect(token?.key).toBe('user.name');
	});

	it('should return undefined for non-existent token', () => {
		const token = findToken('entry.nonexistent', {});
		
		expect(token).toBeUndefined();
	});

	it('should find system tokens', () => {
		const token = findToken('system.now', {});
		
		expect(token).toBeDefined();
		expect(token?.scope).toBe('system');
	});
});

describe('TokenRegistry - Edge Cases', () => {
	it('should handle empty context gracefully', () => {
		const tokens = getAvailableTokens({});
		
		// Should at least return system tokens
		expect(tokens.length).toBeGreaterThan(0);
		expect(tokens.some(t => t.scope === 'system')).toBe(true);
	});

	it('should handle null/undefined config values', () => {
		const context: TokenContext = {
			siteConfig: {
				name: 'Site',
				nullValue: null,
				undefinedValue: undefined
			}
		};
		
		const tokens = getAvailableTokens(context, { scope: 'site' });
		
		// Should still include all config keys
		expect(tokens.some(t => t.key === 'site.name')).toBe(true);
	});

	it('should handle fields without db_fieldName', () => {
		const context: TokenContext = {
			collection: {
				fields: [
					{
						label: 'Test'
						// Missing db_fieldName
					} as any
				]
			} as Schema
		};
		
		const tokens = getAvailableTokens(context, { scope: 'entry' });
		
		// Should not crash, just skip the field
		expect(tokens).toBeDefined();
	});
});
