import type mongoose from 'mongoose';
import type { Model } from './types';
import crypto from 'crypto';

// Function to check if the current time is within the token expiration time
function isWithinExpiration(expiresInMs: number) {
	return Date.now() <= expiresInMs; // always returns a boolean
}

// Function to create a new token
export async function createToken(_id: mongoose.Types.ObjectId, Token: Model, user_id: mongoose.Types.ObjectId, email: string, expires: number) {
	// Generate a random 16-byte token string using crypto.randomBytes
	const token = crypto.randomBytes(16).toString('hex'); // Generate a random token
	const expiresIn = Date.now() + expires; // Calculate the expiration time in milliseconds

	// Insert the new token into the database
	await Token.insertMany({ _id, token, user_id, email, expiresIn });

	return token; // Return the created token
}

//Function to validate a token
export async function validateToken(Token: Model, token: string, user_id: mongoose.Types.ObjectId) {
	const result = await Token.findOne({ user_id, token }); // Find the token in the database
	if (result) {
		if (isWithinExpiration(result.expiresIn)) {
			return { success: true, message: 'Token is Valid' }; // If the token is within expiration, return success
		} else {
			return { success: false, message: 'Token is expired' }; // If the token is expired, return failure
		}
	} else {
		return { success: false, message: 'Token does not exist' }; // If the token does not exist, return failure
	}
}

// Function to consume a token
export async function consumeToken(Token: Model, token: string, user_id: mongoose.Types.ObjectId) {
	const result = await Token.findOne({ user_id, token }); // Find the token in the database
	if (result) {
		await Token.deleteOne({ user_id, token }); // Delete the token from the database
		if (isWithinExpiration(result.expiresIn)) {
			return { status: true, message: 'Token is Valid' }; // If the token is within expiration, return success
		} else {
			return { status: false, message: 'Token is expired' }; // If the token is expired, return failure
		}
	} else {
		return { status: false, message: 'Token does not exist' }; // If the token does not exist, return failure
	}
}
