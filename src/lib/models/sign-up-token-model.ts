// token for user registions & roll
import mongoose from 'mongoose';

const SignUpTokenSchema = new mongoose.Schema(
	{
		_id: {
			type: String
		},
		email: String,
		role: String,
		resetRequestedAt: Date,
		resetToken: String,
		expiresAt: Date,
	},
	{ _id: false }
);

export const SignUpToken =
	mongoose.models.sign_up_token ?? mongoose.model('sign_up_token', SignUpTokenSchema);
