import { describe, it, expect, beforeAll } from 'bun:test';
import { TokenRegistry, replaceTokens } from '@src/services/token/engine';
import { processTokensInResponse } from '@src/utils/tokenHelper';
import { modifierRegistry } from '@src/services/token/modifiers';

describe('Token System', () => {
	beforeAll(() => {
		// Register some test tokens by calling getTokens with customTokens
		TokenRegistry.getTokens(undefined, undefined, {
			customTokens: [
				{
					token: 'test.hello',
					name: 'Hello',
					category: 'system',
					resolve: () => 'Hello World'
				},
				{
					token: 'test.user',
					name: 'User',
					category: 'user',
					resolve: (ctx) => ctx?.user?.username || 'Guest'
				}
			]
		});

		// Register a test modifier
		modifierRegistry.set('reverse', (val) => String(val).split('').reverse().join(''));
	});

	it('should replace simple tokens', async () => {
		const result = await replaceTokens('Say {{test.hello}}!');
		expect(result).toBe('Say Hello World!');
	});

	it('should handle context', async () => {
		const context = { user: { username: 'Alice' } } as any;
		const result = await replaceTokens('Welcome {{test.user}}', context);
		expect(result).toBe('Welcome Alice');
	});

	it('should apply modifiers', async () => {
		const result = await replaceTokens('{{test.hello|reverse}}');
		expect(result).toBe('dlroW olleH');
	});

	it('should apply multiple modifiers', async () => {
		const result = await replaceTokens('{{test.hello|reverse|upper}}');
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
		const result = await replaceTokens('Unknown: {{test.unknown}}');
		expect(result).toBe('Unknown: {{test.unknown}}');
	});
});
