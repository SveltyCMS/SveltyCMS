/**
 * @file src/utils/encryption.ts
 * @description Provides utility functions for encrypting and decrypting strings using AES-256-CBC encryption.
 * This module is designed to handle sensitive data encryption and decryption for the application.
 *
 * @requires crypto - Node.js crypto module for cryptographic operations
 * @requires @src/stores/globalSettings - For accessing encryption settings from database
 *
 * @constant ENCRYPTION_KEY - A fixed key used for encryption and decryption, retrieved from database settings
 * @constant IV_LENGTH - The length of the initialization vector, fixed at 16 bytes for AES
 */

import { getGlobalSetting } from '@src/stores/globalSettings';

import crypto from 'crypto';

const ENCRYPTION_KEY = getGlobalSetting<string>('ENCRYPTION_KEY') || 'default-encryption-key-change-me';
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
