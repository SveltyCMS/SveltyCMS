// Import the mongoose library
import mongoose from 'mongoose';

// Define the schema for the User model
const UserSchema = new mongoose.Schema(
	{
		_id: {
			type: String // Set the type of the _id field to String
		},
		email: String, // The email address of the user
		role: String, // The role of the user
		username: String, // The username of the user
		firstname: String, // The first name of the user
		lastname: String, // The last name of the user
		avatar: String, // The avatar of the user
		resetRequestedAt: String, // The date and time when a password reset was requested
		resetToken: String, // The password reset token value
		expiresAt: Date, // The date and time when the password reset token expires
		lastActiveAt: Date // The date and time when the user last accessed the application
	},
	{ _id: false, timestamps: true } // Do not automatically generate the _id field and enable timestamps
);

let User: mongoose.Model<any> = null as any;

// Delete the existing user model if it exists
if (mongoose.models && mongoose.models.auth_user) {
	mongoose.deleteModel('auth_user');
}

// Create and export the User model using the 'user' collection name
User = mongoose.model('auth_user', UserSchema);

// Check if the first user exists in the database
let firstUserExists = false;
User.findOne({})
	.then((user) => {
		// Check if user is not null
		firstUserExists = !!user;
	})
	.catch((err) => {
		console.error(err);
	});
export { firstUserExists, User };
