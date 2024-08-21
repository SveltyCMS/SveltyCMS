/**
 * @file src/databases/dbInterface.ts
 * @description Database interface definition for the CMS.
 *
 * This module defines the dbInterface, which serves as a contract for database adapters.
 * It specifies methods for:
 * - Database connection and setup
 * - Basic CRUD operations
 * - Draft and revision management
 * - Widget management
 * - Theme management
 * - System preferences management
 *
 * The interface ensures consistency across different database implementations
 * (e.g., MongoDB, MariaDB, PostgreSQL) by defining a common set of methods
 * that must be implemented by each adapter.
 *
 * It also defines a generic CollectionModel interface for use by database adapters.
 *
 * Usage:
 * This interface should be implemented by all database adapters in the CMS.
 * It provides a unified API for database operations, allowing for easy
 * swapping of database backends without changing the application logic.
 */

import type { ScreenSize } from '@stores/screenSizeStore';
import type { UserPreferences, WidgetPreference } from '@stores/userPreferences';

export interface dbInterface {
	// Database Connection and Setup Methods
	connect(): Promise<void>;
	getCollectionModels(): Promise<Record<string, any>>;
	setupAuthModels(): void;
	setupMediaModels(): void;

	// Additional Methods for Data Operations
	findOne(collection: string, query: object): Promise<any>;
	findMany(collection: string, query: object): Promise<any[]>;
	insertOne(collection: string, doc: object): Promise<any>;
	insertMany(collection: string, docs: object[]): Promise<any[]>;
	updateOne(collection: string, query: object, update: object): Promise<any>;
	updateMany(collection: string, query: object, update: object): Promise<any>;
	deleteOne(collection: string, query: object): Promise<number>;
	deleteMany(collection: string, query: object): Promise<number>;
	countDocuments(collection: string, query?: object): Promise<number>;

	// Methods for Draft and Revision Management
	generateId(): string;
	createDraft?(content: any, originalDocumentId: string, userId: string): Promise<any>;
	updateDraft?(draftId: string, content: any): Promise<any>;
	publishDraft?(draftId: string): Promise<any>;
	getDraftsByUser?(userId: string): Promise<any[]>;
	createRevision?(documentId: string, content: any, userId: string): Promise<any>;
	getRevisions?(documentId: string): Promise<any[]>;

	// Methods for Widget Management
	installWidget(widgetData: { name: string; isActive?: boolean }): Promise<void>;
	getAllWidgets(): Promise<any[]>;
	getActiveWidgets(): Promise<string[]>;
	activateWidget(widgetName: string): Promise<void>;
	deactivateWidget(widgetName: string): Promise<void>;
	updateWidget(widgetName: string, updateData: any): Promise<void>;

	// Theme-related methods
	setDefaultTheme(themeName: string): Promise<void>;
	storeThemes(themes: { name: string; path: string; isDefault?: boolean }[]): Promise<void>;
	getDefaultTheme(): Promise<any>;
	getAllThemes(): Promise<any[]>;

	// System Preferences
	getSystemPreferences(userId: string): Promise<UserPreferences | null>;
	updateSystemPreferences(userId: string, screenSize: ScreenSize, preferences: WidgetPreference[]): Promise<void>;
	clearSystemPreferences(userId: string): Promise<void>;

	// Media Management
	getLastFiveMedia(): Promise<any[]>;

	// Method for Disconnecting
	disconnect(): Promise<void>;
}

// Define a generic Collection type to be used by database adapters
export interface CollectionModel {
	modelName: string;
	find(query: object): Promise<any[]>;
	updateOne(query: object, update: object): Promise<any>;
	updateMany(query: object, update: object): Promise<any>;
	insertMany(docs: object[]): Promise<any[]>;
	deleteOne(query: object): Promise<number>;
	deleteMany(query: object): Promise<number>;
	countDocuments(query?: object): Promise<number>;
}
