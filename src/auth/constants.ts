/**
 * @file src/auth/constants.ts
 * @description Authentication constants that are safe to import on both client and server
 *
 * This file contains constants that don't depend on server-side modules
 * and can be safely imported in client-side code.
 */

export const SESSION_COOKIE_NAME = 'auth_sessions';

export function generateRandomToken(length: number = 32): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

export function generateTokenWithExpiry(expirationMinutes: number = 60): { token: string; expires: Date } {
	return {
		token: generateRandomToken(),
		expires: new Date(Date.now() + expirationMinutes * 60 * 1000)
	};
}
