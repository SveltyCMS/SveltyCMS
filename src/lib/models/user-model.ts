// The user table stores the users
import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
	{
		_id: {
			type: String
		},
		email: String,
		role: String,
		username: String,
		firstname: String,
		lastname: String,
		avatar: String,
		resetRequestedAt: String,
		resetToken: String
	},
	{ _id: false }
);

export const User = mongoose.models.user ?? mongoose.model('user', UserSchema);
