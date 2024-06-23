import mongoose from 'mongoose';

// Defines the GraphQL type definition for User. (no Passwords)
export function userTypeDefs() {
	return `
        type User {
            _id: String
            email: String
            username: String
            role: String
            avatar: String
            lastAuthMethod: String
            lastActivity: String
            expiresAt: String
            isRegistered: Boolean
            #------------------------
            createdAt: String
            updatedAt: String
        }
    `;
}

// Provides resolvers for querying User data.
export function userResolvers() {
	return {
		// Resolver function for fetching users.

		users: async () => {
			// Fetch the user model
			const userModel = mongoose.models['auth_users'];
			// Find all users and return them
			return await userModel.find().lean();
		}
	};
}
