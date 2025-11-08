/**
 * @file apps/shared-config/dbInterface.ts
 * @description Minimal database interfaces shared between setup-wizard and cms
 * Contains only the essential types needed by setup-wizard during initial setup.
 */

import type { DatabaseId, ISODateString } from './types.js';

/**
 * Theme configuration structure
 */
export interface ThemeConfig {
	tailwindConfigPath: string;
	assetsPath: string;
}

/**
 * Theme entity - represents a visual theme for the CMS
 */
export interface Theme {
	_id: DatabaseId;
	createdAt: ISODateString;
	updatedAt: ISODateString;
	name: string;
	path: string;
	isActive: boolean;
	isDefault: boolean;
	config: ThemeConfig;
	previewImage?: string;
}

/**
 * Database operation result wrapper
 */
export interface DatabaseResult<T> {
	success: boolean;
	data?: T;
	error?: string;
}

/**
 * Minimal database adapter interface
 * Only includes methods actually used by setup-wizard
 */
export interface IDBAdapter {
	/** Wait for database connection to be ready */
	waitForConnection?(): Promise<void>;

	/** Check if database is connected */
	isConnected(): boolean;

	/** Connect to database */
	connect(connectionString: string, options?: unknown): Promise<DatabaseResult<void>>;

	/** Disconnect from database */
	disconnect(): Promise<DatabaseResult<void>>;

	/** Auth methods used during setup */
	auth: {
		setupAuthModels(): Promise<void>;
		createUser(userData: Partial<unknown>): Promise<DatabaseResult<unknown>>;
		createSession(sessionData: { user_id: string; expires: Date; tenantId?: string }): Promise<DatabaseResult<unknown>>;
	};

	/** System preferences used during setup */
	systemPreferences: {
		set<T>(key: string, value: T, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>>;
		setMany<T>(preferences: Array<{ key: string; value: T; scope?: 'user' | 'system'; userId?: DatabaseId }>): Promise<DatabaseResult<void>>;
	};
}

/**
 * Minimal database adapter interface (alias for compatibility)
 */
export type DatabaseAdapter = IDBAdapter;
