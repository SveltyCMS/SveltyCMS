// The session table stores the user’s sessions
import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema(
	{
		_id: {
			type: String // session id
		},
		user_id: {
			type: String,
			required: true // reference to user(id)
		},
		active_expires: {
			type: Number,
			required: true // the expiration time (unix) of the session (active)
		},
		idle_expires: {
			type: Number,
			required: true // the expiration time (unix) for the idle period
		}
	},
	{ _id: false }
);
export const Session =
	mongoose.models.auth_session ?? mongoose.model('auth_session', SessionSchema);
