import type { Auth } from 'lucia';
import bcrypt from 'bcrypt';
// crypto.
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const passwordToken = (auth: Auth, name, options) => {
	return {
		issue: async (userId) => {
			const token = await bcrypt.hashSync(userId, 10);
			return token;
		},
		validate: async (token, userId) => {
			try {
				return bcrypt.compareSync(userId, token);
			} catch (e) {
				const error: any = e;
				if (error.message === 'AUTH_INVALID_KEY_ID') throw new Error('INVALID_TOKEN');
				if (error.message === 'AUTH_EXPIRED_KEY') throw new Error('EXPIRED_TOKEN');
				throw e;
			}
		}
	};
};
