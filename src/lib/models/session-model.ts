//The session table stores the user’s sessions
import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema(
	{
		_id: {
			type: String
		},
		user_id: {
			type: String,
			required: true
		},
		active_expires: {
			type: Number,
			required: true
		},
		idle_expires: {
			type: Number,
			required: true
		}
	},
	{ _id: false }
);
export const Session = mongoose.models.session ?? mongoose.model('session', SessionSchema);
