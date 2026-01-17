/** @file test/bun/token-system.test.ts
 * @description Tests the token system
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

import { describe, it, expect } from 'bun:test';
import { replaceTokens } from '@shared/services/token/engine';

describe('Token System', () => {
	const context = {
		user: {
			_id: '1',
			email: 'test@test.com',
			password: '123',
			role: 'admin',
			permissions: {}
		} as any,
		entry: { title: 'Hello', price: 50 }
	};

	it('replaces basic tokens', async () => {
		expect(await replaceTokens('Title: {{entry.title}}', context)).toBe('Title: Hello');
	});

	it('applies modifiers', async () => {
		expect(await replaceTokens('{{entry.title | upper}}', context)).toBe('HELLO');
	});

	it('supports logic', async () => {
		expect(await replaceTokens('{{entry.price | gt(10) | if("Big", "Small")}}', context)).toBe('Big');
	});

	it('BLOCKS restricted user fields', async () => {
		expect(await replaceTokens('{{user.password}}', context)).toBe('');
	});

	it('supports escaping', async () => {
		expect(await replaceTokens('Use \\{{token}}', context)).toBe('Use {{token}}');
	});
});
