// The key table stores the user’s keys.
import mongoose from 'mongoose';

const KeySchema = new mongoose.Schema(
	{
		_id: {
			type: String // key id in the form of: ${providerId}:${providerUserId}
		},
		user_id: {
			type: String,
			required: true // reference to user(id)
		},

		// Not strictly required by Lucia, but we'll be using it
		hashed_password: String, // hashed password of the key
		primary_key: {
			type: Boolean,
			required: true // true for primary keys
		},
		expires: Number // expiration for key if defined (number)
	},
	{ _id: false }
);

export const Key = mongoose.models.auth_key ?? mongoose.model('auth_key', KeySchema);
