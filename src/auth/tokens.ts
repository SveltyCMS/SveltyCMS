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

// System Logger
import logger from '@src/utils/logger';

// Custom Error class for Token-related operations
class TokenError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TokenError';
	}
}

// Helper function for centralized logging
function log(level: 'info' | 'debug' | 'warn' | 'error', message: string, additionalInfo: any = {}) {
	logger[level](`${message} ${JSON.stringify(additionalInfo)}`);
}

// Function to check if the current time is within the token expiration time
function isWithinExpiration(expiresAt: Date): boolean {
	const currentTime = Date.now();
	const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
	return currentTime < expiresAt.getTime() - bufferTime;
}

// Function to create a new token
export async function createNewToken(TokenModel: Model<Token>, user_id: string, email: string, expires: number): Promise<string> {
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
		const expiresIn = new Date(Date.now() + expires);

		// Insert the new token into the database
		await TokenModel.create({ user_id, token, email, expires: expiresIn });

		log('info', 'New token created', { user_id });
		return token; // Return the created token
	} catch (error) {
		log('error', 'Failed to create new token', { user_id, error: (error as Error).message });
		throw new TokenError('Failed to create new token');
	}
}

// Function to validate a token
export async function validateToken(TokenModel: Model<Token>, token: string, user_id: string): Promise<{ success: boolean; message: string }> {
	log('debug', 'Validating token', { user_id });

	try {
		const result = await TokenModel.findOne({ user_id, token });

		if (result) {
			if (isWithinExpiration(result.expires)) {
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
	} catch (error) {
		log('error', 'Failed to validate token', { user_id, error: (error as Error).message });
		throw new TokenError('Failed to validate token');
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

			if (isWithinExpiration(result.expires)) {
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
	} catch (error) {
		log('error', 'Failed to consume token', { user_id, error: (error as Error).message });
		throw new TokenError('Failed to consume token');
	}
}
