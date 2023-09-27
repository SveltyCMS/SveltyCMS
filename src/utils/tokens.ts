import { generateRandomString, isWithinExpiration } from 'lucia/utils';
import mongoose from 'mongoose';
export async function createToken(userID: string, expiresIn = 60 * 60 * 1000) {
	const tokens = mongoose.models['auth_tokens'];
	const token = generateRandomString(16);
	await tokens.insertMany({ userID, token, expiresIn: Date.now() + expiresIn });
	return token;
}
export async function deleteToken(token: string, userID: string) {
	const tokens = mongoose.models['auth_tokens'];

	const result = await tokens.findOne({ userID, token });
	if (result.deletedCount > 0) {
		return { status: true, message: 'token has been deleted' };
	} else {
		return { status: false, message: 'token does not exist' };
	}
}
export async function validateToken(token: string, userID: string) {
	const tokens = mongoose.models['auth_tokens'];
	const result = await tokens.findOne({ userID, token });
	console.log(userID, token);
	if (result) {
		if (isWithinExpiration(result.expiresIn)) {
			return { status: true, message: 'token is Valid' };
		} else {
			return { status: false, message: 'token is expired' };
		}
	} else {
		return { status: false, message: 'Token does not exist' };
	}
}
export async function consumeToken(token: string, userID: string) {
	const tokens = mongoose.models['auth_tokens'];
	const result = await tokens.findOne({ userID, token });
	console.log(userID, token);
	if (result) {
		console.log(await tokens.deleteOne({ userID, token }));
		if (isWithinExpiration(result.expiresIn)) {
			return { status: true, message: 'token is Valid' };
		} else {
			return { status: false, message: 'token is expired' };
		}
	} else {
		return { status: false, message: 'Token does not exist' };
	}
}