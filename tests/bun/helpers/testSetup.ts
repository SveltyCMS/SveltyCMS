/**
 * @file tests/bun/helpers/testSetup.ts
 * @description Test setup and cleanup utilities for Bun tests
 *
 * This module provides utilities to:
 * - Initialize test environment
 * - Clean up database state before/after tests
 * - Reset MongoDB collections for test isolation
 * - Setup test data fixtures
 */

import { privateEnv } from '@root/config/private';
import { connectToMongoDB } from '@src/databases/mongodb/dbconnect';
import mongoose from 'mongoose';
import { logger } from '../mocks/logger';

/**
 * Test database cleanup - drops all collections to ensure clean state
 */
export async function cleanupTestDatabase(): Promise<void> {
	try {
		// Ensure we're connected to MongoDB
		if (mongoose.connection.readyState !== 1) {
			await connectToMongoDB();
		}

		// Get all collection names
		const collections = await mongoose.connection.db.listCollections().toArray();

		// Drop all collections
		for (const collection of collections) {
			await mongoose.connection.db.dropCollection(collection.name);
		}

		logger.info(`🧹 Test database cleaned: dropped ${collections.length} collections`);
	} catch (error) {
		// If the error is just that collections don't exist, that's fine
		if (error.message?.includes('ns not found')) {
			logger.debug('No collections to drop - database already clean');
		} else {
			logger.error('Error cleaning test database:', error);
			throw error;
		}
	}
}

/**
 * Initialize test environment with clean database
 */
export async function initializeTestEnvironment(): Promise<void> {
	try {
		// Connect to test database
		await connectToMongoDB();

		// Clean up any existing test data
		await cleanupTestDatabase();

		logger.info('🚀 Test environment initialized');
	} catch (error) {
		logger.error('Failed to initialize test environment:', error);
		throw error;
	}
}

/**
 * Cleanup test environment after tests
 */
export async function cleanupTestEnvironment(): Promise<void> {
	try {
		// Clean up test data
		await cleanupTestDatabase();

		// Close database connection
		if (mongoose.connection.readyState === 1) {
			await mongoose.connection.close();
		}

		logger.info('🧹 Test environment cleaned up');
	} catch (error) {
		logger.error('Error during test cleanup:', error);
		throw error;
	}
}

/**
 * Ensure we're using test database
 */
export function ensureTestDatabase(): void {
	const dbName = privateEnv.DB_NAME;
	if (!dbName.includes('test')) {
		throw new Error(`Test database name must contain 'test'. Current: ${dbName}`);
	}
}

/**
 * Create test fixtures - common test data
 */
export const testFixtures = {
	users: {
		firstAdmin: {
			email: 'admin@test.com',
			username: 'admin',
			password: 'Test123!',
			firstName: 'Admin',
			lastName: 'User'
		},
		invitedUser: {
			email: 'invited@test.com',
			username: 'invited',
			password: 'Test123!',
			firstName: 'Invited',
			lastName: 'User'
		},
		oauthUser: {
			email: 'oauth@test.com',
			username: 'oauthuser',
			firstName: 'OAuth',
			lastName: 'User'
		}
	},
	roles: {
		admin: {
			name: 'Admin',
			isAdmin: true,
			permissions: ['all']
		},
		user: {
			name: 'User',
			isAdmin: false,
			permissions: ['read']
		}
	}
};
