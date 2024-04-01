import type { Model } from './types';
import crypto from 'crypto';

// Function to check if the current time is within the token expiration time
function isWithinExpiration(expiresInMs: number) {
	// Get the current time in milliseconds using Date.now()
	const currentTime = Date.now();

	// Check if the current time has passed the expiration time
	if (currentTime > expiresInMs) {
		return false; // Token is expired
	}
}

// Function to create a new token
export async function createToken(Token: Model, userID: string, expiresIn: number) {
	// Generate a random 16-byte token string using crypto.randomBytes
	const token = crypto.randomBytes(16).toString('hex'); // Generate a random token
	await Token.insertMany({ userID, token, expiresIn: Date.now() + expiresIn }); // Insert the new token into the database
	return token; // Return the created token
}

// Function to validate a token
export async function validateToken(Token: Model, token: string, userID: string) {
	const result = await Token.findOne({ userID, token }); // Find the token in the database
	if (result) {
		if (isWithinExpiration(result.expiresIn)) {
			return { success: true, message: 'token is Valid' }; // If the token is within expiration, return success
		} else {
			return { success: false, message: 'token is expired' }; // If the token is expired, return failure
		}
	} else {
		return { success: false, message: 'Token does not exist' }; // If the token does not exist, return failure
	}
}

// Function to consume a token
export async function consumeToken(Token: Model, token: string, userID: string) {
	const result = await Token.findOne({ userID, token }); // Find the token in the database
	if (result) {
		await Token.deleteOne({ userID, token }); // Delete the token from the database
		if (isWithinExpiration(result.expiresIn)) {
			return { status: true, message: 'Token is Valid' }; // If the token is within expiration, return success
		} else {
			return { status: false, message: 'Token is expired' }; // If the token is expired, return failure
		}
	} else {
		return { status: false, message: 'Token does not exist' }; // If the token does not exist, return failure
	}
}
