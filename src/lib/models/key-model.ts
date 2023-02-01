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
		hashed_password: String,
		primary: {
			type: Boolean,
			required: true
		}
	},
	{ _id: false }
);

export const Key = mongoose.models.key ?? mongoose.model('key', KeySchema);
