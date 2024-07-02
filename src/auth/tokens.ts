import type { Model, Token } from './types';
import crypto from 'crypto';

// Function to check if the current time is within the token expiration time
function isWithinExpiration(expiresAt: Date): boolean {
	const currentTime = Date.now();
	const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
	return currentTime < expiresAt.getTime() - bufferTime;
}

// Function to create a new token
export async function createNewToken(TokenModel: Model<Token>, user_id: string, email: string, expires: number): Promise<string> {
	// Check if a token for this user_id already exists
	const existingToken = await TokenModel.findOne({ user_id });

	if (existingToken) {
		// If a token exists, delete it before creating a new one
		await TokenModel.deleteOne({ user_id });
	}

	// Generate a random 16-byte token string using crypto.randomBytes
	const token = crypto.randomBytes(16).toString('hex');
	const expiresIn = new Date(Date.now() + expires);

	// Insert the new token into the database
	await TokenModel.create({ user_id, token, email, expires: expiresIn });

	// Return the created token
	return token;
}

// Function to validate a token
export async function validateToken(TokenModel: Model<Token>, token: string, user_id: string): Promise<{ success: boolean; message: string }> {
	const result = await TokenModel.findOne({ user_id, token });

	if (result) {
		if (isWithinExpiration(result.expires)) {
			return { success: true, message: 'Token is valid' };
		} else {
			return { success: false, message: 'Token is expired' };
		}
	} else {
		return { success: false, message: 'Token does not exist' };
	}
}

// Function to consume a token
export async function consumeToken(TokenModel: Model<Token>, token: string, user_id: string): Promise<{ status: boolean; message: string }> {
	const result = await TokenModel.findOne({ user_id, token });

	if (result) {
		await TokenModel.deleteOne({ user_id, token });

		if (isWithinExpiration(result.expires)) {
			return { status: true, message: 'Token is valid' };
		} else {
			return { status: false, message: 'Token is expired' };
		}
	} else {
		return { status: false, message: 'Token does not exist' };
	}
}
