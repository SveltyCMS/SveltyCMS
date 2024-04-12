import type { Date } from 'mongoose';
import type { Model } from './types';
import crypto from 'crypto';

// Function to check if the current time is within the token expiration time
function isWithinExpiration(expiresInMs: number) {
	const currentTime = Date.now();
	if (currentTime > expiresInMs) return false;
	return true;
}

// Function to create a new token
export async function createToken(Token: Model, user_id: string, email: string, expires: number) {
	// Generate a random 16-byte token string using crypto.randomBytes
	const token = crypto.randomBytes(16).toString('hex'); // Generate a random token
	const expiresIn = new Date(Date.now() + expires); // Convert milliseconds to Date
	// Insert the new token into the database
	await Token.insertMany({ token, user_id, email, expiresIn });
	// Return the created token
	return token;
}

// Function to validate a token
export async function validateToken(Token: Model, token: string, user_id: string) {
	console.log('Validating token:', token, 'for user:', user_id); // Log token and user ID

	const result = await Token.findOne({ user_id, token }); // Find the token in the database

	if (result) {
		console.log('Token found:', result); // Log the found token document

		if (isWithinExpiration(result.expiresIn)) {
			console.log('Token is valid.');
			return { success: true, message: 'Token is Valid' }; // If the token is within expiration, return success
		} else {
			console.log('Token is expired.');
			return { success: false, message: 'Token is expired' }; // If the token is expired, return failure
		}
	} else {
		console.log('Token not found.');
		return { success: false, message: 'Token does not exist' }; // If the token does not exist, return failure
	}
}

// Function to consume a token
export async function consumeToken(Token: Model, token: string, user_id: string) {
	console.log('Consuming token:', token, 'for user:', user_id); // Log token and user ID

	const result = await Token.findOne({ user_id, token }); // Find the token in the database

	if (result) {
		console.log('Token found:', result); // Log the found token document

		await Token.deleteOne({ user_id, token }); // Delete the token

		if (isWithinExpiration(result.expiresIn)) {
			console.log('Token consumed successfully.');
			return { status: true, message: 'Token is Valid' }; // If the token is within expiration, return success
		} else {
			console.log('Token was expired but consumed.'); // Log even if expired
			return { status: false, message: 'Token is expired' }; // If the token is expired, return failure
		}
	} else {
		console.log('Token not found for consumption.');
		return { status: false, message: 'Token does not exist' }; // If the token does not exist, return failure
	}
}
