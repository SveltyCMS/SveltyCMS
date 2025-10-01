/**
 * @file src/databases/mongodb/methods/authMethods.ts
 * @description Authentication model registration for the MongoDB adapter.
 * This class is responsible for idempotently registering auth-related Mongoose models.
 */

import { logger } from '@utils/logger.svelte';
import type Mongoose from 'mongoose';
import { createDatabaseError } from './mongoDBUtils';

/**
 * A dedicated class for registering authentication models with a Mongoose instance.
 * It uses Dependency Injection to allow for a testable, modular setup.
 */
export class MongoAuthModelRegistrar {
	private readonly mongoose: typeof Mongoose;

	/**
	 * Constructs the model registrar.
	 * @param {typeof Mongoose} mongooseInstance - The Mongoose instance to register models with.
	 */
	constructor(mongooseInstance: typeof Mongoose) {
		this.mongoose = mongooseInstance;
		logger.info('MongoAuthModelRegistrar initialized.');
	}

	/**
	 * Dynamically imports and registers the authentication models (User, Token, Session).
	 * This process is idempotent; it will not re-register models that already exist.
	 * @throws {DatabaseError} If schemas cannot be imported or models fail to register.
	 */
	async setupAuthModels(): Promise<void> {
		try {
			// Dynamically import schemas only when needed to avoid circular dependencies
			const { UserSchema } = await import('@src/auth/mongoDBAuth/userAdapter');
			const { TokenSchema } = await import('@src/auth/mongoDBAuth/tokenAdapter');
			const { SessionSchema } = await import('@src/auth/mongoDBAuth/sessionAdapter');

			// Register each model using the private helper
			this._registerModel('auth_users', UserSchema);
			this._registerModel('auth_sessions', SessionSchema);
			this._registerModel('auth_tokens', TokenSchema);

			logger.info('Authentication models registered successfully.');
		} catch (error) {
			throw createDatabaseError(error, 'AUTH_MODEL_SETUP_FAILED', 'Failed to set up authentication models');
		}
	}

	/**
	 * A private helper that checks for a model's existence before registering it.
	 * @param {string} name - The name of the model.
	 * @param {Mongoose.Schema} schema - The Mongoose schema for the model.
	 */
	private _registerModel(name: string, schema: Mongoose.Schema): void {
		// Use the injected mongoose instance
		if (!this.mongoose.models[name]) {
			this.mongoose.model(name, schema);
			logger.debug(`Model '${name}' was registered.`);
		} else {
			logger.debug(`Model '${name}' already exists and was not re-registered.`);
		}
	}
}
