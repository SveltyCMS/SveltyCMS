/**
 * @file src/databases/drizzleDBAdapter.ts
 * @description Drizzle ORM adapter for SQL databases in the CMS.
 *
 * This module provides an implementation of the dbInterface for SQL databases using Drizzle ORM:
 * - Connects to and manages SQL database connections (MariaDB, PostgreSQL)
 * - Implements CRUD operations for collections, drafts, and revisions
 * - Handles user, role, and permission management
 * - Manages media storage and retrieval
 *
 * Features:
 * - Database connection management with retry mechanism
 * - Implementation of all dbInterface methods for SQL databases
 * - Schema creation and management using Drizzle ORM
 * - Support for transactions and complex queries
 * - Error handling and logging for all database operations
 *
 * Usage:
 * This adapter is used when the CMS is configured to use a SQL database.
 * It provides a database-agnostic interface for all database operations in the CMS.
 */

import { privateEnv } from '@root/config/private';

import { v4 as uuidv4 } from 'uuid';
import type { dbInterface } from '../dbInterface';

//Stores
import { collections } from '@root/src/stores/collectionStore.svelte';
import type { Unsubscriber } from 'svelte/store';

// Drizzel
import { drizzle, sql } from 'drizzle-orm';
import * as mariadb from 'drizzle-orm/mysql2';
import * as postgres from 'drizzle-orm/postgres';

// System Logger
import { logger } from '@utils/logger.svelte';

// Define connection configuration for MariaDB and PostgreSQL
const dbConfig = {
	mariadb: {
		client: mariadb,
		connection: {
			host: privateEnv.DB_HOST,
			user: privateEnv.DB_USER,
			password: privateEnv.DB_PASSWORD,
			database: privateEnv.DB_NAME
		}
	},
	postgres: {
		client: postgres,
		connection: {
			host: privateEnv.DB_HOST,
			user: privateEnv.DB_USER,
			password: privateEnv.DB_PASSWORD,
			database: privateEnv.DB_NAME
		}
	}
};

// Create the database connection based on the environment configuration
const dbClient =
	privateEnv.DB_TYPE === 'mariadb'
		? drizzle(dbConfig.mariadb.client(dbConfig.mariadb.connection))
		: drizzle(dbConfig.postgres.client(dbConfig.postgres.connection));

interface CollectionField {
	name: string;
	type: string;
}

interface CollectionConfig {
	fields: CollectionField[];
}

export interface CollectionModel {
	[key: string]: CollectionConfig;
}

export class DrizzleDBAdapter implements dbInterface {
	private unsubscribe: Unsubscriber | undefined;
	private tables: { [key: string]: boolean } = {};
	private collectionsModels: CollectionModel = {};
	private isInitialized: boolean = false;

	async connect(): Promise<void> {
		if (this.isInitialized) {
			logger.info('Database already initialized');
			return;
		}

		let attempts = privateEnv.DB_RETRY_ATTEMPTS || 3;
		while (attempts > 0) {
			try {
				await dbClient.execute(sql`SELECT 1`);
				logger.info(`Successfully connected to ${privateEnv.DB_NAME}`);
				await this.initialize();
				this.isInitialized = true;
				return;
			} catch (error) {
				attempts--;
				const err = error as Error;
				logger.error(`Failed to connect to the database. Attempts left: ${attempts}. Error: ${err.message}`);

				if (attempts <= 0) {
					const errorMsg = 'Failed to connect to the database after maximum retries.';
					logger.error(errorMsg);
					throw Error(errorMsg);
				}

				await new Promise((resolve) => setTimeout(resolve, 5000));
			}
		}
	}

	async initialize(): Promise<void> {
		logger.debug('Initializing DrizzleDBAdapter...');

		// Subscribe to collections store
		this.unsubscribe = collections.subscribe(async (cols) => {
			for (const [contentTypes, collection] of Object.entries(cols)) {
				if (!this.tables[contentTypes]) {
					logger.debug(`Setting up table for collection: ${contentTypes}`);
					await this.setupTable(contentTypes, collection);
				}
			}
		});

		logger.debug('DrizzleDBAdapter initialization complete.');
	}

	async setupTable(contentTypes: string, collection: any): Promise<void> {
		const tableSql = this.generateTableSQL(contentTypes, collection);
		try {
			await dbClient.execute(tableSql);
			this.tables[contentTypes] = true;
			logger.info(`Table created for collection: ${contentTypes}`);
		} catch (error) {
			logger.error(`Error creating table for collection: ${contentTypes}. Error: ${(error as Error).message}`);
			throw error;
		}
	}

	generateTableSQL(contentTypes: string, collection: any): string {
		const columns = collection.fields
			.map((field: any) => {
				const type = this.getSQLType(field.type);
				return `${field.name} ${type}`;
			})
			.join(', ');

		return `CREATE TABLE IF NOT EXISTS ${contentTypes} (${columns});`;
	}

	getSQLType(fieldType: string): string {
		switch (fieldType) {
			case 'string':
				return 'VARCHAR(255)';
			case 'number':
				return 'INT';
			case 'boolean':
				return 'BOOLEAN';
			case 'date':
				return 'DATE';
			default:
				throw Error(`Unsupported field type: ${fieldType}`);
		}
	}

	async setupAuthModels(): Promise<void> {
		// Add your logic to setup authorization models
	}

	async setupMediaModels(): Promise<void> {
		// Add your logic to setup media models
	}

	async getCollectionModels(): Promise<CollectionModel> {
		return this.collectionsModels;
	}

	async findOne(collection: string, query: object): Promise<any> {
		const result = await dbClient.execute(sql`SELECT * FROM ${collection} WHERE ${query} LIMIT 1`);
		return result[0];
	}

	async findMany(collection: string, query: object): Promise<any[]> {
		const results = await dbClient.execute(sql`SELECT * FROM ${collection} WHERE ${query}`);
		return results;
	}

	async insertMany(collection: string, docs: object[]): Promise<any[]> {
		const results = await dbClient.execute(sql`INSERT INTO ${collection} VALUES (${docs})`);
		return results;
	}

	async updateOne(collection: string, query: object, update: object): Promise<any> {
		const result = await dbClient.execute(sql`UPDATE ${collection} SET ${update} WHERE ${query} LIMIT 1`);
		return result;
	}

	async updateMany(collection: string, query: object, update: object): Promise<any> {
		const results = await dbClient.execute(sql`UPDATE ${collection} SET ${update} WHERE ${query}`);
		return results;
	}

	async deleteOne(collection: string, query: object): Promise<number> {
		const result = await dbClient.execute(sql`DELETE FROM ${collection} WHERE ${query} LIMIT 1`);
		return result.rowCount;
	}

	async deleteMany(collection: string, query: object): Promise<number> {
		const results = await dbClient.execute(sql`DELETE FROM ${collection} WHERE ${query}`);
		return results.rowCount;
	}

	async countDocuments(collection: string, query?: object): Promise<number> {
		const result = await dbClient.execute(sql`SELECT COUNT(*) FROM ${collection} WHERE ${query || 1}`);
		return result[0].count;
	}

	async generateId(): Promise<string> {
		return uuidv4();
	}

	async createDraft(content: any, originalDocumentId: string, userId: string): Promise<any> {
		const draftId = uuidv4();
		await dbClient.execute(
			sql`INSERT INTO drafts (id, content, original_document_id, user_id) VALUES (${draftId}, ${content}, ${originalDocumentId}, ${userId})`
		);
		return { draftId, content, originalDocumentId, userId };
	}

	async updateDraft(draftId: string, content: any): Promise<any> {
		await dbClient.execute(sql`UPDATE drafts SET content = ${content} WHERE id = ${draftId}`);
		return { draftId, content };
	}

	async publishDraft(draftId: string): Promise<any> {
		const draft = await this.findOne('drafts', { id: draftId });
		const { original_document_id, content } = draft;
		await dbClient.execute(sql`UPDATE documents SET content = ${content} WHERE id = ${original_document_id}`);
		await this.deleteOne('drafts', { id: draftId });
		return draft;
	}

	async getDraftsByUser(userId: string): Promise<any[]> {
		const drafts = await this.findMany('drafts', { user_id: userId });
		return drafts;
	}

	async createRevision(documentId: string, content: any, userId: string): Promise<any> {
		const revisionId = uuidv4();
		await dbClient.execute(
			sql`INSERT INTO revisions (id, document_id, content, user_id) VALUES (${revisionId}, ${documentId}, ${content}, ${userId})`
		);
		return { revisionId, documentId, content, userId };
	}

	async getRevisions(documentId: string): Promise<any[]> {
		const revisions = await this.findMany('revisions', { document_id: documentId });
		return revisions;
	}

	async installWidget(widgetData: { name: string; isActive?: boolean }): Promise<void> {
		await dbClient.execute(sql`INSERT INTO widgets (name, is_active) VALUES (${widgetData.name}, ${widgetData.isActive || true})`);
	}

	async getAllWidgets(): Promise<any[]> {
		const widgets = await this.findMany('widgets', {});
		return widgets;
	}

	async getActiveWidgets(): Promise<string[]> {
		const widgets = await this.findMany('widgets', { is_active: true });
		return widgets.map((widget) => widget.name);
	}

	async activateWidget(widgetName: string): Promise<void> {
		await dbClient.execute(sql`UPDATE widgets SET is_active = true WHERE name = ${widgetName}`);
	}

	async deactivateWidget(widgetName: string): Promise<void> {
		await dbClient.execute(sql`UPDATE widgets SET is_active = false WHERE name = ${widgetName}`);
	}

	async updateWidget(widgetName: string, updateData: any): Promise<void> {
		await dbClient.execute(sql`UPDATE widgets SET ${updateData} WHERE name = ${widgetName}`);
	}

	async setDefaultTheme(themeName: string): Promise<void> {
		await dbClient.execute(sql`UPDATE themes SET is_default = false`);
		await dbClient.execute(sql`UPDATE themes SET is_default = true WHERE name = ${themeName}`);
	}

	async storeThemes(themes: { name: string; path: string; isDefault?: boolean }[]): Promise<void> {
		for (const theme of themes) {
			await dbClient.execute(sql`INSERT INTO themes (name, path, is_default) VALUES (${theme.name}, ${theme.path}, ${theme.isDefault || false})`);
		}
	}

	async getDefaultTheme(): Promise<any> {
		const theme = await this.findOne('themes', { is_default: true });
		return theme;
	}

	async getAllThemes(): Promise<any[]> {
		const themes = await this.findMany('themes', {});
		return themes;
	}

	async disconnect(): Promise<void> {
		if (this.unsubscribe) {
			this.unsubscribe();
		}
		logger.info('Disconnected from the database');
	}
}
