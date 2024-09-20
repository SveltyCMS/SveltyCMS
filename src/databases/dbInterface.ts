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

// Define a Theme type for better type safety
export interface Theme {
	name: string;
	path: string;
	isDefault: boolean;
	createdAt: number;
	updatedAt: number;
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

// Define the dbInterface with specific return types
export interface dbInterface {
	// Database Connection and Setup Methods
	connect(): Promise<void>; // Connect to the database and return a promise that resolves when connected.
	getCollectionModels(): Promise<Record<string, any>>; // Return a promise that resolves with an object containing all the CollectionModels.
	setupAuthModels(): void; // Set up the auth models.
	setupMediaModels(): void; // Set up the media models.

	// Additional Methods for Data Operations
	findOne(collection: string, query: object): Promise<any>; // Find one document from a collection
	findMany(collection: string, query: object): Promise<any[]>; // Find multiple documents from a collection
	insertOne(collection: string, doc: object): Promise<any>; // Insert one document into a collection
	insertMany(collection: string, docs: object[]): Promise<any[]>; // Insert many documents into a collection
	updateOne(collection: string, query: object, update: object): Promise<any>; // Update only one document in a collection
	updateMany(collection: string, query: object, update: object): Promise<any>; // Update many documents in a collection
	deleteOne(collection: string, query: object): Promise<number>; // Delete documents in a collection
	deleteMany(collection: string, query: object): Promise<number>; // Delete documents in a collection
	countDocuments(collection: string, query?: object): Promise<number>; // Count documents in a collection
	convertId(id: string): any; // Convert mongo ObjectId to string

	// Methods for Draft and Revision Management
	generateId(): string; // Generate a unique id for each
	createDraft?(content: any, original_document_id: string, user_id: string): Promise<any>; // Create a draft of a document
	updateDraft?(draft_id: string, content: any): Promise<any>; // Update a draft of a document
	publishDraft?(draft_id: string): Promise<any>; // Publish a draft of a document
	getDraftsByUser?(user_id: string): Promise<any[]>; // Get drafts of a user
	createRevision?(document_id: string, content: any, user_id: string): Promise<any>; // Create a revision of a document
	getRevisions?(document_id: string): Promise<any[]>; // Get revisions of a document

	// Methods for Widget Management
	installWidget(widgetData: { name: string; isActive?: boolean }): Promise<void>; // Install a widget from a URL or a local file.
	getAllWidgets(): Promise<any[]>; // Get all installed widgets.
	getActiveWidgets(): Promise<string[]>; // Get active widgets.
	activateWidget(widgetName: string): Promise<void>; // Activate a widget
	deactivateWidget(widgetName: string): Promise<void>; // Deactivate a widget
	updateWidget(widgetName: string, updateData: any): Promise<void>; // Update a widget

	// Theme-related methods
	setDefaultTheme(themeName: string): Promise<void>; // Set the default theme.
	storeThemes(themes: Theme[]): Promise<void>; // Store a list of themes.
	getDefaultTheme(): Promise<Theme | null>; // Get the default theme.
	getAllThemes(): Promise<Theme[]>; // Get all themes.

	// System Preferences
	getSystemPreferences(user_id: string): Promise<UserPreferences | null>; // Get system preferences.
	updateSystemPreferences(user_id: string, screenSize: ScreenSize, preferences: WidgetPreference[]): Promise<void>; // Update system preferences.
	clearSystemPreferences(user_id: string): Promise<void>; // Clear system preferences.

	// Virtual Folder Methods for direct database interactions
	createVirtualFolder(folderData: { name: string; parent?: string; path: string }): Promise<any>; // Create a virtual folder.
	getVirtualFolders(): Promise<any[]>; // Get virtual folders.
	getVirtualFolderContents(folderId: string): Promise<any[]>; // Get virtual folders.
	updateVirtualFolder(folderId: string, updateData: { name?: string; parent?: string }): Promise<any>; // Update virtual folder.
	deleteVirtualFolder(folderId: string): Promise<boolean>; // Delete virtual folder.
	moveMediaToFolder(mediaId: string, folderId: string): Promise<boolean>; // Move media to folder.

	// Media Management
	getAllMedia(): Promise<any[]>; // Get all media.
	getMediaInFolder(folder_id: string): Promise<any[]>; // Get media in folder.
	deleteMedia(media_id: string): Promise<boolean>; // Delete media.
	getLastFiveMedia(): Promise<any[]>; // Get last five media.

	// Method for Disconnecting
	disconnect(): Promise<void>; // Disconnect from server.
}
