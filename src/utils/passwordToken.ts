import type { Auth } from 'lucia';
import { generateRandomString } from 'lucia/utils';

export class Token {
	value;
	toString = () => this.value;
	expiresAt;
	expired;
	userId;
	key;
	constructor(value, key) {
		this.value = value;
		this.expiresAt = key.expiresAt;
		this.expired = key.expired;
		this.userId = key.userId;
		this.key = key;
	}
}
export const passwordToken = (auth: Auth, name, options) => {
	const defaultGenerateRandomPassword = (length) => {
		return generateRandomString(length, '0123456789');
	};
	return {
		issue: async (_userId) => {
			const generate = options.generate ?? defaultGenerateRandomPassword;
			const token = generate(options.length ?? 8);
			return token;
		},
		validate: async (token, userId) => {
			const providerUserId = [userId, token].join('.');
			try {
				const key = await auth.useKey(name, providerUserId, null);
				// if (key.type !== 'single_use') throw new LuciaTokenError('INVALID_TOKEN');
				if (key.type !== 'single_use') throw new Error('INVALID_TOKEN');
				// return new Token(token, key);
				return true;
			} catch (e) {
				const error: any = e;
				if (error.message === 'AUTH_INVALID_KEY_ID') throw new Error('INVALID_TOKEN');
				if (error.message === 'AUTH_EXPIRED_KEY') throw new Error('EXPIRED_TOKEN');
				throw e;
			}
		}
	};
};
