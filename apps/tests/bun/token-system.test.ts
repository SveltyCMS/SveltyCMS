/** @file test/bun/token-system.test.ts
 * @description Tests the token system
 */

import { describe, it, expect } from 'bun:test';
import { replaceTokens } from '@src/services/token/engine';

describe('Token System', () => {
	const context = {
		user: { email: 'test@test.com', password: '123' },
		entry: { title: 'Hello', price: 50 }
	};

	it('replaces basic tokens', async () => {
		expect(await replaceTokens('Title: {{entry.title}}', context)).toBe('Title: Hello');
	});

	it('applies modifiers', async () => {
		expect(await replaceTokens('{{entry.title | upper}}', context)).toBe('HELLO');
	});

	it('supports logic', async () => {
		expect(await replaceTokens('{{entry.price | gt:10 | if:"Big":"Small"}}', context)).toBe('Big');
	});

	it('BLOCKS restricted user fields', async () => {
		expect(await replaceTokens('{{user.password}}', context)).toBe('');
	});

	it('supports escaping', async () => {
		expect(await replaceTokens('Use \\{{token}}', context)).toBe('Use {{token}}');
	});
});
