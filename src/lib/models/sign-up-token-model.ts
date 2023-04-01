// Import the mongoose library
import mongoose from 'mongoose';

// Define the schema for the SignUpToken model
const SignUpTokenSchema = new mongoose.Schema(
	{
		_id: {
			type: String // Set the type of the _id field to String
		},
		email: String, // The email address associated with the sign-up token
		role: String, // The role associated with the sign-up token
		resetRequestedAt: Date, // The date and time when the sign-up token was requested
		resetToken: String, // The sign-up token value
		expiresAt: Date // The date and time when the sign-up token expires
	},
	{ _id: false } // Do not automatically generate the _id field
);

// Delete the existing sign_up_token model if it exists
if (mongoose.models && mongoose.models.sign_up_token) {
	mongoose.deleteModel('sign_up_token');
}

// Create and export the SignUpToken model using the 'sign_up_token' collection name
export const SignUpToken =
	mongoose.models.sign_up_token || mongoose.model('sign_up_token', SignUpTokenSchema);
