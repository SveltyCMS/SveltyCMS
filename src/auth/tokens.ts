/**
 * @file src/auth/tokens.ts
 * @description Utility functions for token management.
 *
 * This module provides functionality to:
 * - Create new tokens
 * - Validate existing tokens
 * - Consume tokens
 *
 * Features:
 * - Secure token generation
 * - Token validation with expiration checking
 * - One-time use token consumption
 * - Integration with the auth database adapter
 *
 * Usage:
 * Utilized for various token-based operations in the authentication system
 */

import type { Model, Token } from './types';
import crypto from 'crypto';
import { error } from '@sveltejs/kit';

// System Logger
import { logger } from '@utils/logger';

// Type for log additional info
interface LogAdditionalInfo {
	user_id?: string;
	email?: string;
	token?: string;
}

// Helper function for centralized logging
function log(level: 'info' | 'debug' | 'warn' | 'error', message: string, additionalInfo: LogAdditionalInfo = {}) {
	logger[level](`${message} ${JSON.stringify(additionalInfo)}`);
}

// Function to check if the current time is within the token expiration time
function isWithinExpiration(expiresAt: string): boolean {
	const currentTime = new Date();
	const expirationTime = new Date(expiresAt);
	const bufferTime = 5 * 60 * 1000; // 5 minutes buffer in milliseconds
	return currentTime < new Date(expirationTime.getTime() - bufferTime);
}

// Function to create a new token
export async function createNewToken(TokenModel: Model<Token>, user_id: string, email: string, expiresInSeconds: number): Promise<string> {
	log('debug', 'Creating new token', { user_id, email });

	try {
		// Check if a token for this user_id already exists
		const existingToken = await TokenModel.findOne({ user_id });

		if (existingToken) {
			log('info', 'Existing token found; deleting before creating new one', { user_id });
			// If a token exists, delete it before creating a new one
			await TokenModel.deleteOne({ user_id });
		}

		// Generate a random token string using crypto.randomBytes
		const token = crypto.randomBytes(32).toString('hex'); // 256-bit random token
		const expiresAt = new Date(Date.now() + expiresInSeconds * 1000); // Calculate expiration time

		// Insert the new token into the database
		await TokenModel.create({ user_id, token, email, expires: expiresAt });

		log('info', 'New token created', { user_id });
		return token; // Return the created token
	} catch (err) {
		const message = `Error in createNewToken: ${err instanceof Error ? err.message : String(err)}`;
		log('error', message, { user_id, email });
		throw error(500, message);
	}
}

// Function to validate a token
export async function validateToken(TokenModel: Model<Token>, token: string, user_id: string): Promise<{ success: boolean; message: string }> {
	log('debug', 'Validating token', { user_id });

	try {
		const result = await TokenModel.findOne({ user_id, token });

		if (result) {
			if (isWithinExpiration(result.expires.toISOString())) {
				log('info', 'Token is valid', { user_id });
				return { success: true, message: 'Token is valid' };
			} else {
				log('warn', 'Token is expired', { user_id });
				return { success: false, message: 'Token is expired' };
			}
		} else {
			log('warn', 'Token does not exist', { user_id });
			return { success: false, message: 'Token does not exist' };
		}
	} catch (err) {
		const message = `Error in validateToken: ${err instanceof Error ? err.message : String(err)}`;
		log('error', message, { user_id, token });
		throw error(500, message);
	}
}

// Function to consume a token
export async function consumeToken(TokenModel: Model<Token>, token: string, user_id: string): Promise<{ status: boolean; message: string }> {
	log('debug', 'Consuming token', { user_id });

	try {
		const result = await TokenModel.findOne({ user_id, token });

		if (result) {
			await TokenModel.deleteOne({ user_id, token });
			log('info', 'Token deleted', { user_id });

			if (isWithinExpiration(result.expires.toISOString())) {
				log('info', 'Token is valid and consumed', { user_id });
				return { status: true, message: 'Token is valid' };
			} else {
				log('warn', 'Token is expired', { user_id });
				return { status: false, message: 'Token is expired' };
			}
		} else {
			log('warn', 'Token does not exist', { user_id });
			return { status: false, message: 'Token does not exist' };
		}
	} catch (err) {
		const message = `Error in consumeToken: ${err instanceof Error ? err.message : String(err)}`;
		log('error', message, { user_id, token });
		throw error(500, message);
	}
}
