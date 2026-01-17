/**
 * @file tests/token-system.test.ts
 * @description Unit tests for the token system.
 *
 * ## Architecture Overview
 * The token system is a core component of the SveltyCMS framework that provides a flexible and extensible way to insert dynamic content into responses.
 *
 * ## Test Structure
 * - **Token Registration**: Tests the registration of tokens with different categories and types.
 * - **Token Replacement**: Tests the replacement of tokens in strings and objects.
 * - **Modifier Application**: Tests the application of modifiers to tokens.
 * - **Context Handling**: Tests the handling of context in token replacement.
 *
 * ## Test Cases
 * - **Simple Token Replacement**: Tests the replacement of a simple token in a string.
 * - **Context Handling**: Tests the handling of context in token replacement.
 * - **Modifier Application**: Tests the application of modifiers to tokens.
 * - **Unknown Token**: Tests the handling of unknown tokens.
 */

import { describe, it, expect, beforeAll } from 'bun:test';
import { TokenRegistry, replaceTokens } from '@shared/services/token/engine';
import { processTokensInResponse } from '@shared/services/token/helper';
import { modifierRegistry } from '@shared/services/token/modifiers';

describe('Token System', () => {
	beforeAll(() => {
		// Register some test tokens by calling getTokens with customTokens
		TokenRegistry.getTokens(undefined, undefined, {
			customTokens: [
				{
					token: 'test.hello',
					name: 'Hello',
					description: 'Test hello token',
					category: 'system',
					type: 'string',
					resolve: () => 'Hello World'
				},
				{
					token: 'test.user',
					name: 'User',
					description: 'Test user token',
					category: 'user',
					type: 'string',
					resolve: (ctx) => ctx?.user?.username || 'Guest'
				}
			]
		});

		// Register a test modifier
		modifierRegistry.set('reverse', (val) => String(val).split('').reverse().join(''));
	});

	it('should replace simple tokens', async () => {
		const result = await replaceTokens('Say {{test.hello}}!', {} as any);
		expect(result).toBe('Say Hello World!');
	});

	it('should handle context', async () => {
		const context = { user: { username: 'Alice' } } as any;
		const result = await replaceTokens('Welcome {{test.user}}', context);
		expect(result).toBe('Welcome Alice');
	});

	it('should apply modifiers', async () => {
		const result = await replaceTokens('{{test.hello|reverse}}', {} as any);
		expect(result).toBe('dlroW olleH');
	});

	it('should apply multiple modifiers', async () => {
		const result = await replaceTokens('{{test.hello|reverse|upper}}', {} as any);
		expect(result).toBe('DLROW OLLEH');
	});

	it('should process tokens in objects recursively', async () => {
		const data = {
			message: 'Say {{test.hello}}',
			nested: {
				user: '{{test.user}}',
				list: ['Item {{test.hello}}']
			}
		};

		const context = { user: { username: 'Bob' } } as any;
		const processed = await processTokensInResponse(data, context.user, 'en');

		expect(processed.message).toBe('Say Hello World');
		expect(processed.nested.user).toBe('Bob');
		expect(processed.nested.list[0]).toBe('Item Hello World');
	});

	it('should handle unknown tokens gracefully', async () => {
		const result = await replaceTokens('Unknown: {{test.unknown}}', {} as any);
		expect(result).toBe('Unknown: {{test.unknown}}');
	});
});
