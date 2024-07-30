import type { Model, Token } from './types';
import crypto from 'crypto';

// System Logger
import logger from '@src/utils/logger';

// Function to check if the current time is within the token expiration time
function isWithinExpiration(expiresAt: Date): boolean {
	const currentTime = Date.now();
	const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
	return currentTime < expiresAt.getTime() - bufferTime;
}

// Function to create a new token
export async function createNewToken(TokenModel: Model<Token>, user_id: string, email: string, expires: number): Promise<string> {
	logger.debug(`Creating new token for user_id: ${user_id}, email: ${email}`);

	// Check if a token for this user_id already exists
	const existingToken = await TokenModel.findOne({ user_id });

	if (existingToken) {
		logger.info(`Existing token found for user_id: ${user_id}. Deleting before creating a new one.`);
		// If a token exists, delete it before creating a new one
		await TokenModel.deleteOne({ user_id });
	}

	// Generate a random 16-byte token string using crypto.randomBytes
	const token = crypto.randomBytes(16).toString('hex');
	const expiresIn = new Date(Date.now() + expires);

	// Insert the new token into the database
	await TokenModel.create({ user_id, token, email, expires: expiresIn });

	logger.info(`New token created for user_id: ${user_id}`);
	// Return the created token
	return token;
}

// Function to validate a token
export async function validateToken(TokenModel: Model<Token>, token: string, user_id: string): Promise<{ success: boolean; message: string }> {
	logger.debug(`Validating token for user_id: ${user_id}`);

	const result = await TokenModel.findOne({ user_id, token });

	if (result) {
		if (isWithinExpiration(result.expires)) {
			logger.info(`Token is valid for user_id: ${user_id}`);
			return { success: true, message: 'Token is valid' };
		} else {
			logger.warn(`Token is expired for user_id: ${user_id}`);
			return { success: false, message: 'Token is expired' };
		}
	} else {
		logger.warn(`Token does not exist for user_id: ${user_id}`);
		return { success: false, message: 'Token does not exist' };
	}
}

// Function to consume a token
export async function consumeToken(TokenModel: Model<Token>, token: string, user_id: string): Promise<{ status: boolean; message: string }> {
	logger.debug(`Consuming token for user_id: ${user_id}`);

	const result = await TokenModel.findOne({ user_id, token });

	if (result) {
		await TokenModel.deleteOne({ user_id, token });
		logger.info(`Token deleted for user_id: ${user_id}`);

		if (isWithinExpiration(result.expires)) {
			logger.info(`Token is valid and consumed for user_id: ${user_id}`);
			return { status: true, message: 'Token is valid' };
		} else {
			logger.warn(`Token is expired for user_id: ${user_id}`);
			return { status: false, message: 'Token is expired' };
		}
	} else {
		logger.warn(`Token does not exist for user_id: ${user_id}`);
		return { status: false, message: 'Token does not exist' };
	}
}
