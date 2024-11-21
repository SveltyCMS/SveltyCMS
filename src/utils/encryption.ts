/**
 * @file encryption.ts
 * @description Utility functions for string encryption and decryption using AES-256-CBC.
 *
 * This file contains two main functions:
 * 1. encrypt(text: string): string - Encrypts a given string.
 * 2. decrypt(text: string): string - Decrypts an encrypted string.
 *
 * The encryption uses a fixed ENCRYPTION_KEY from environment variables and a random 16-byte initialization vector (IV).
 *
 * @requires crypto - Node.js crypto module for cryptographic operations
 * @requires @root/config/private - For accessing private environment variables
 *
 * @constant ENCRYPTION_KEY - A fixed key used for encryption and decryption, retrieved from environment variables
 * @constant IV_LENGTH - The length of the initialization vector, fixed at 16 bytes for AES
 */

import { privateEnv } from '@root/config/private';

import crypto from 'crypto';

const ENCRYPTION_KEY = privateEnv.ENCRYPTION_KEY;
const IV_LENGTH = 16; // For AES, this is always 16

// Encrypts a string
export function encrypt(text: string): string {
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
	let encrypted = cipher.update(text);
	encrypted = Buffer.concat([encrypted, cipher.final()]);
	return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// Decrypts an encrypted string
export function decrypt(text: string): string {
	const textParts = text.split(':');
	const iv = Buffer.from(textParts.shift()!, 'hex');
	const encryptedText = Buffer.from(textParts.join(':'), 'hex');
	const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
	let decrypted = decipher.update(encryptedText);
	decrypted = Buffer.concat([decrypted, decipher.final()]);
	return decrypted.toString();
}
