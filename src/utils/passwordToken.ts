import type { Auth } from 'lucia';
import crypto from 'crypto';

// Token class definition
export class Token {
	value: any;
	toString = () => this.value;
	expiresAt: any;
	expired: any;
	userId: any;
	key: any;
	constructor(value, key) {
		this.value = value;
		this.expiresAt = key.expiresAt;
		this.expired = key.expired;
		this.userId = key.userId;
		this.key = key;
	}
}

// passwordToken function definition
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const passwordToken = (auth: Auth, name, options) => {
	return {
		issue: async (userId) => {
			const token = crypto.createHash('sha256').update(userId).digest('hex');
			return token;
		},
		validate: async (token, userId) => {
			try {
				const hash = crypto.createHash('sha256').update(userId).digest('hex');
				return hash === token;
			} catch (e) {
				const error: any = e;
				if (error.message === 'AUTH_INVALID_KEY_ID') throw new Error('INVALID_TOKEN');
				if (error.message === 'AUTH_EXPIRED_KEY') throw new Error('EXPIRED_TOKEN');
				throw e;
			}
		}
	};
};
