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
	_id: string; // The ID of the theme
	name: string; // The name of the theme
	path: string; // The path to the theme file
	isDefault: boolean; // Whether the theme is the default theme
	createdAt: number; // Creation timestamp of the theme (Unix timestamp in seconds)
	updatedAt: number; // Last update timestamp of the theme (Unix timestamp in seconds)
}

export interface Widget {
	_id: string; // The ID of the widget
	name: string; // The name of the widget
	isActive: boolean; // Whether the widget is active
	createdAt: number; // Creation timestamp of the widget (Unix timestamp in seconds)
	updatedAt: number; // Last update timestamp of the widget (Unix timestamp in seconds)
}

export interface SystemVirtualFolder {
	_id: string; // The ID of the virtual folder
	name: string; // The name of the virtual folder
	parent: string; // The ID of the parent folder
	path: string; // The path of the virtual folder
}

// Draft Interface
export interface Draft {
	_id: string; // Unique identifier for the draft
	originalDocumentId: string; // ID of the original document
	collectionId: string; // ID of the collection the draft belongs to
	createdBy: string; // ID of the user who created the draft
	content: any; // Content of the draft
	createdAt: number; // Creation timestamp of the draft (Unix timestamp in seconds)
	updatedAt: number; // Last update timestamp of the draft (Unix timestamp in seconds)
	status: 'draft' | 'published'; // Status of the draft
}

// Revision Interface
export interface Revision {
	_id: string; // Unique identifier for the revision
	collectionId: string; // ID of the collection
	documentId: string; // ID of the document
	createdBy: string; // ID of the user who created the revision
	content: any; // Content of the revision
	createdAt: number; // Creation timestamp of the revision (Unix timestamp in seconds)
	version: number; // Version number of the revision
}

// Collection interface
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
	createDraft?(content: any, collectionId: string, original_document_id: string, user_id: string): Promise<Draft>; // Create a new draft
	updateDraft?(draft_id: string, content: any): Promise<Draft>; // Update an existing draft
	publishDraft?(draft_id: string): Promise<Draft>; // Publish a draft
	getDraftsByUser?(user_id: string): Promise<Draft[]>; // Get drafts by user
	createRevision(collectionId: string, documentId: string, userId: string, data: any): Promise<Revision>; // Create a new revision
	getRevisions(collectionId: string, documentId: string): Promise<Revision[]>; // Get revisions for a document
	restoreRevision(collectionId: string, revisionId: string): Promise<void>; // Restore a specific revision
	deleteRevision(revisionId: string): Promise<void>; // Delete a specific revision

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
