/**
 * @file src/auth/tokens.ts
 * @description Utility functions for token management.
 *
 * This module provides functionality to:
 * - Create new tokens, scoped to a tenant
 * - Validate existing tokens within a tenant
 * - Consume tokens within a tenant
 *
 * Features:
 * - Secure token generation
 * - Token validation with expiration checking
 * - One-time use token consumption
 * - Integration with the auth database adapter
 */

import type { Model } from 'mongoose';
import type { Token } from './types';
import { error } from '@sveltejs/kit';
import { privateEnv } from '@root/config/private';
import { v4 as uuidv4 } from 'uuid';

// System Logger
import { logger } from '@utils/logger.svelte';

// Type for log additional info
interface LogAdditionalInfo {
	user_id?: string;
	email?: string;
	token?: string;
	tenantId?: string;
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
export async function createNewToken(
	TokenModel: Model<Token>,
	user_id: string,
	email: string,
	expiresInSeconds: number,
	tenantId?: string
): Promise<string> {
	log('debug', 'Creating new token', { user_id, email, tenantId });

	try {
		const query: { user_id: string; tenantId?: string } = { user_id };
		if (privateEnv.MULTI_TENANT && tenantId) {
			query.tenantId = tenantId;
		} // Check if a token for this user_id already exists in the current tenant

		const existingToken = await TokenModel.findOne(query);

		if (existingToken) {
			log('info', 'Existing token found; deleting before creating new one', { user_id, tenantId });
			await TokenModel.deleteOne(query);
		}

		// Use uuidv4 for token generation - much simpler and safer
		const token = uuidv4().replace(/-/g, ''); // Remove hyphens for a cleaner token
		const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

		const tokenData: Partial<Token> = { user_id, token, email, expires: expiresAt };
		if (privateEnv.MULTI_TENANT && tenantId) {
			tokenData.tenantId = tenantId;
		}

		await TokenModel.create(tokenData);

		log('info', 'New token created', { user_id, tenantId });
		return token;
	} catch (err) {
		const message = `Error in createNewToken: ${err instanceof Error ? err.message : String(err)}`;
		log('error', message, { user_id, email, tenantId });
		throw error(500, message);
	}
}

// Function to validate a token
export async function validateToken(
	TokenModel: Model<Token>,
	token: string,
	user_id: string,
	tenantId?: string
): Promise<{ success: boolean; message: string }> {
	log('debug', 'Validating token', { user_id, tenantId });

	try {
		const query: { user_id: string; token: string; tenantId?: string } = { user_id, token };
		if (privateEnv.MULTI_TENANT && tenantId) {
			query.tenantId = tenantId;
		}
		const result = await TokenModel.findOne(query);

		if (result) {
			if (isWithinExpiration(result.expires.toISOString())) {
				log('info', 'Token is valid', { user_id, tenantId });
				return { success: true, message: 'Token is valid' };
			} else {
				log('warn', 'Token is expired', { user_id, tenantId });
				return { success: false, message: 'Token is expired' };
			}
		} else {
			log('warn', 'Token does not exist', { user_id, tenantId });
			return { success: false, message: 'Token does not exist' };
		}
	} catch (err) {
		const message = `Error in validateToken: ${err instanceof Error ? err.message : String(err)}`;
		log('error', message, { user_id, token, tenantId });
		throw error(500, message);
	}
}

// Function to consume a token
export async function consumeToken(
	TokenModel: Model<Token>,
	token: string,
	user_id: string,
	tenantId?: string
): Promise<{ status: boolean; message: string }> {
	log('debug', 'Consuming token', { user_id, tenantId });

	try {
		const query: { user_id: string; token: string; tenantId?: string } = { user_id, token };
		if (privateEnv.MULTI_TENANT && tenantId) {
			query.tenantId = tenantId;
		}
		const result = await TokenModel.findOne(query);

		if (result) {
			await TokenModel.deleteOne(query);
			log('info', 'Token deleted', { user_id, tenantId });

			if (isWithinExpiration(result.expires.toISOString())) {
				log('info', 'Token is valid and consumed', { user_id, tenantId });
				return { status: true, message: 'Token is valid' };
			} else {
				log('warn', 'Token is expired', { user_id, tenantId });
				return { status: false, message: 'Token is expired' };
			}
		} else {
			log('warn', 'Token does not exist', { user_id, tenantId });
			return { status: false, message: 'Token does not exist' };
		}
	} catch (err) {
		const message = `Error in consumeToken: ${err instanceof Error ? err.message : String(err)}`;
		log('error', message, { user_id, token, tenantId });
		throw error(500, message);
	}
}
