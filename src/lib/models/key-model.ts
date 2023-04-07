// The key table stores the user’s keys.
import mongoose from 'mongoose';

const KeySchema = new mongoose.Schema(
	{
		_id: {
			type: String
		},
		user_id: {
			type: String,
			required: true
		},

		// Not strictly required by Lucia, but we'll be using it
		hashed_password: String,
		primary_key: {
			type: Boolean,
			required: true
		},
		expires: Number
	},
	{ _id: false }
);

export const Key = mongoose.models.auth_key ?? mongoose.model('auth_key', KeySchema);
