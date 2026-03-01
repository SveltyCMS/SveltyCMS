/** @file test/bun/token-system.test.ts
 * @description Tests the token system
 */

import { describe, expect, it } from 'bun:test';
import { replaceTokens } from '../../../src/services/token/engine';

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
