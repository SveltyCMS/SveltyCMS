/**
 * @file src/databases/mongodb/methods/authMethods.ts
 * @description Authentication model registration for the MongoDB adapter.
 * This class is responsible for idempotently registering auth-related Mongoose models.
 */

import { logger } from '@utils/logger.svelte';
import type Mongoose from 'mongoose';
import { createDatabaseError } from './mongoDBUtils';
import { UserSchema } from '../models/authUser';
import { TokenSchema } from '../models/authToken';
import { SessionSchema } from '../models/authSession';

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
	 * Registers authentication models (User, Token, Session).
	 * This process is idempotent; it will not re-register models that already exist.
	 * @throws {DatabaseError} If schemas cannot be imported or models fail to register.
	 */
	async setupAuthModels(): Promise<void> {
		try {
			// Schemas are now statically imported at top of file
			// This avoids dynamic import warning and improves code splitting

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
			logger.debug(`Model '\x1b[34m${name}\x1b[0m' was registered`);
		} else {
			logger.debug(`Model '\x1b[34m${name}\x1b[0m' already exists and was not re-registered`);
		}
	}
}
