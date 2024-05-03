import type { DatabaseAdapter } from '@sveltejs/kit';
import mongoose, { ConnectOptions } from 'mongoose';
import { privateEnv, publicEnv } from '$env/static/private';
import { Auth, GoogleOAuth2 } from '@auth/core';
import { MongoDBAdapter } from '@auth/mongodb';

interface DatabaseConfig {
	type: 'mongodb';
	mongoOptions?: ConnectOptions;
}

class DatabaseConnection {
	private mongooseConnection: mongoose.Connection | null = null;
	private auth: Auth | null = null;
	private googleAuth: GoogleOAuth2 | null = null;

	async connect(config: DatabaseConfig): Promise<void> {
		switch (config.type) {
			case 'mongodb':
				console.log('\\\n\\\x1b\\[33m\\\x1b\\[5m====> Trying to Connect to your defined ' + privateEnv.DB_NAME + ' database ...\\\x1b\\[0m');
				this.mongooseConnection = await mongoose.createConnection(privateEnv.DB_HOST, config.mongoOptions);
				console.log(
					`\\\x1b\\\[32m====> Connection to ${privateEnv.DB_NAME} database successful!\\\x1b\\\[0m\\\n====> Enjoying your \\\x1b\\\[31m${publicEnv.SITE_NAME}\\\x1b\\\[0m`
				);

				// Initialize Auth and Google OAuth2
				this.auth = new Auth({
					adapter: new MongoDBAdapter(this.mongooseConnection),
					providers: [
						GoogleOAuth2({
							clientId: privateEnv.GOOGLE_CLIENT_ID,
							clientSecret: privateEnv.GOOGLE_CLIENT_SECRET,
							authorizationParams: {
								redirect_uri: `${privateEnv.HOST_URL}/oauth/google/callback`,
								scope: 'email profile'
							}
						})
					]
				});
				this.googleAuth = this.auth.providers.google as GoogleOAuth2;
				break;
			default:
				throw new Error('Unsupported database type');
		}
	}

	async disconnect(): Promise<void> {
		if (this.mongooseConnection) {
			await this.mongooseConnection.close();
			console.log('Disconnected from MongoDB database');
		}
	}

	getAuth(): Auth | null {
		return this.auth;
	}

	getGoogleAuth(): GoogleOAuth2 | null {
		return this.googleAuth;
	}
}

const databaseConnection = new DatabaseConnection();

const adapter: DatabaseAdapter = {
	async connect(): Promise<void> {
		const config: DatabaseConfig = {
			type: 'mongodb',
			mongoOptions: {
				authSource: 'admin',
				user: privateEnv.DB_USER,
				pass: privateEnv.DB_PASSWORD,
				dbName: privateEnv.DB_NAME,
				compressors: privateEnv.DB_COMPRESSOR
			}
		};

		await databaseConnection.connect(config);
	},

	async disconnect(): Promise<void> {
		await databaseConnection.disconnect();
	}
};

export default adapter;
export const auth = databaseConnection.getAuth();
export const googleAuth = databaseConnection.getGoogleAuth();
