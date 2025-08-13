/**
 * @file encryption.ts
 * @description Server-only utility functions for string encryption and decryption using AES-256-CBC.
 *
 * ⚠️ WARNING: This module uses Node.js crypto and should NEVER be imported by client-side code.
 * Import this only in server-side code (.server.ts files, API routes, hooks.server.ts, etc.)
 *
 * For client-side cryptographic needs, use Web Crypto API instead.
 */

import { privateEnv } from '@root/config/private';

// Server-side only: Dynamic import to prevent bundling in client code
let crypto: typeof import('crypto');

async function getCrypto() {
	if (!crypto) {
		crypto = await import('crypto');
	}
	return crypto;
}

const ENCRYPTION_KEY = privateEnv.ENCRYPTION_KEY;
const IV_LENGTH = 16; // For AES, this is always 16

// Encrypts a string (server-side only)
export async function encrypt(text: string): Promise<string> {
	const cryptoModule = await getCrypto();
	const iv = cryptoModule.randomBytes(IV_LENGTH);
	const cipher = cryptoModule.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
	let encrypted = cipher.update(text);
	encrypted = Buffer.concat([encrypted, cipher.final()]);
	return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// Decrypts an encrypted string (server-side only)
export async function decrypt(text: string): Promise<string> {
	const cryptoModule = await getCrypto();
	const textParts = text.split(':');
	const iv = Buffer.from(textParts.shift()!, 'hex');
	const encryptedText = Buffer.from(textParts.join(':'), 'hex');
	const decipher = cryptoModule.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
	let decrypted = decipher.update(encryptedText);
	decrypted = Buffer.concat([decrypted, decipher.final()]);
	return decrypted.toString();
}
