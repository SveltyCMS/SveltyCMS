import { privateEnv } from '@root/config/private';
import { createRandomID } from '@src/utils/utils';

// Stores
import { collections } from '@stores/store';
import type { Unsubscriber } from 'svelte/store';

// Drizzle
import type { dbInterface } from './dbInterface';
import { drizzle, sql } from 'drizzle-orm';

import * as mariadb from 'drizzle-orm/mariadb';
import * as postgres from 'drizzle-orm/postgres';

// Import logger
import { logger } from '@src/utils/logger';

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
	privateEnv.DB_TYPE === 'mariadb' ? dbConfig.mariadb.client(dbConfig.mariadb.connection) : dbConfig.postgres.client(dbConfig.postgres.connection);
const db = drizzle(dbClient);

export class DrizzleDBAdapter implements dbInterface {
	private unsubscribe: Unsubscriber | undefined;
	private tables: { [key: string]: boolean } = {};
	private collectionsModels: { [key: string]: any } = {};
	private isInitialized: boolean = false;

	async connect(attempts: number = privateEnv.DB_RETRY_ATTEMPTS || 3): Promise<void> {
		if (this.isInitialized) {
			logger.info('Database already initialized');
			return;
		}

		while (attempts > 0) {
			try {
				await db.execute(sql`SELECT 1`);
				logger.info(`Successfully connected to ${privateEnv.DB_NAME}`);
				await this.initialize();
				this.isInitialized = true;
				console.log('connect');
				return;
			} catch (error) {
				attempts--;
				const err = error as Error;
				logger.error(`Failed to connect to the database. Attempts left: ${attempts}. Error: ${err.message}`);

				if (attempts <= 0) {
					const errorMsg = 'Failed to connect to the database after maximum retries.';
					logger.error(errorMsg);
					throw new Error(errorMsg);
				}

				await new Promise((resolve) => setTimeout(resolve, privateEnv.DB_RETRY_DELAY || 3000));
			}
		}
	}

	private async initialize(): Promise<void> {
		await this.createTablesIfNotExist();
		await this.setupCollectionModels();
		this.setupAuthModels();
		this.setupMediaModels();
		this.setupWidgetModels();
	}

	private async createTablesIfNotExist(): Promise<void> {
		try {
			// Create auth tables
			await db.execute(sql`
                CREATE TABLE IF NOT EXISTS auth_users (
                    id VARCHAR(255) PRIMARY KEY,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

			await db.execute(sql`
                CREATE TABLE IF NOT EXISTS auth_sessions (
                    id VARCHAR(255) PRIMARY KEY,
                    user_id VARCHAR(255) NOT NULL,
                    active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES auth_users(id)
                )
            `);

			// Create media tables
			await db.execute(sql`
                CREATE TABLE IF NOT EXISTS media_images (
                    id VARCHAR(255) PRIMARY KEY,
                    url VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

			// ... Create other media tables ...

			// Create system tables
			await db.execute(sql`
                CREATE TABLE IF NOT EXISTS system_widgets (
                    id VARCHAR(255) PRIMARY KEY,
                    name VARCHAR(255) UNIQUE NOT NULL,
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

			await db.execute(sql`
                CREATE TABLE IF NOT EXISTS collection_drafts (
                    id VARCHAR(255) PRIMARY KEY,
                    original_document_id VARCHAR(255) NOT NULL,
                    content TEXT NOT NULL,
                    created_by VARCHAR(255) NOT NULL,
                    status VARCHAR(50) DEFAULT 'draft',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

			await db.execute(sql`
                CREATE TABLE IF NOT EXISTS collection_revisions (
                    id VARCHAR(255) PRIMARY KEY,
                    document_id VARCHAR(255) NOT NULL,
                    content TEXT NOT NULL,
                    created_by VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

			logger.info('Core tables created or already exist');
		} catch (error) {
			const err = error as Error;
			logger.error(`Error creating core tables: ${err.message}`);
			throw error;
		}
	}

	private async setupCollectionModels(): Promise<void> {
		return new Promise<void>((resolve) => {
			this.unsubscribe = collections.subscribe(async (collections) => {
				if (collections) {
					for (const collection of Object.values(collections)) {
						if (!collection.name) continue;

						if (!this.tables[collection.name]) {
							await this.createCollectionTable(collection.name, collection.fields);
						}

						this.collectionsModels[collection.name] = db.getTable(collection.name);
						logger.info(`Collection model for ${collection.name} set up.`);
					}

					this.unsubscribe && this.unsubscribe();
					this.unsubscribe = undefined;
					logger.info('Collection models setup complete.');
					resolve();
				}
			});
		});
	}

	private async createCollectionTable(name: string, fields: any): Promise<void> {
		const fieldDefinitions = Object.entries(fields)
			.map(([fieldName, fieldType]) => {
				return `${fieldName} ${this.getSQLType(fieldType)}`;
			})
			.join(', ');

		const query = sql`
            CREATE TABLE IF NOT EXISTS ${name} (
                id VARCHAR(255) PRIMARY KEY,
                ${fieldDefinitions},
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

		try {
			await db.execute(query);
			this.tables[name] = true;
			logger.info(`Table ${name} created or already exists`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error creating table ${name}: ${err.message}`);
			throw error;
		}
	}

	private getSQLType(fieldType: string): string {
		switch (fieldType) {
			case 'string':
				return 'VARCHAR(255)';
			case 'number':
				return 'FLOAT';
			case 'boolean':
				return 'BOOLEAN';
			case 'date':
				return 'TIMESTAMP';
			default:
				return 'TEXT';
		}
	}

	async generateId(): Promise<string> {
		return createRandomID();
	}

	setupAuthModels(): void {
		// Define your auth models setup here
		// This method is called only once during initialization
	}

	setupMediaModels(): void {
		// Define your media models setup here
		// This method is called only once during initialization
	}

	setupWidgetModels(): void {
		// Ensure widget models are set up here
		this.createTablesIfNotExist();
	}

	// Install a new widget
	async installWidget(widgetData: { name: string; isActive?: boolean }): Promise<void> {
		try {
			const widgetId = await this.generateId();
			await db.execute(sql`
                INSERT INTO system_widgets (id, name, is_active, created_at, updated_at)
                VALUES (${widgetId}, ${widgetData.name}, ${widgetData.isActive ?? false}, NOW(), NOW())
            `);
			logger.info(`Widget ${widgetData.name} installed successfully.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error installing widget: ${err.message}`);
			throw new Error(`Error installing widget: ${err.message}`);
		}
	}

	// Fetch all widgets
	async getWidgets(): Promise<any[]> {
		try {
			const result = await db.execute(sql`SELECT * FROM system_widgets`);
			return result;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching widgets: ${err.message}`);
			throw new Error(`Error fetching widgets: ${err.message}`);
		}
	}

	// Fetch active widgets
	async getActiveWidgets(): Promise<string[]> {
		try {
			const result = await db.execute(sql`SELECT name FROM system_widgets WHERE is_active = true`);
			return result.map((row: any) => row.name);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching active widgets: ${err.message}`);
			throw new Error(`Error fetching active widgets: ${err.message}`);
		}
	}

	// Activate a widget
	async activateWidget(widgetName: string): Promise<void> {
		try {
			const result = await db.execute(sql`
                UPDATE system_widgets
                SET is_active = true, updated_at = NOW()
                WHERE name = ${widgetName}
            `);

			if (result.rowCount === 0) {
				throw new Error(`Widget with name ${widgetName} not found or already active.`);
			}

			logger.info(`Widget ${widgetName} activated successfully.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error activating widget: ${err.message}`);
			throw new Error(`Error activating widget: ${err.message}`);
		}
	}

	// Deactivate a widget
	async deactivateWidget(widgetName: string): Promise<void> {
		try {
			const result = await db.execute(sql`
                UPDATE system_widgets
                SET is_active = false, updated_at = NOW()
                WHERE name = ${widgetName}
            `);

			if (result.rowCount === 0) {
				throw new Error(`Widget with name ${widgetName} not found or already inactive.`);
			}

			logger.info(`Widget ${widgetName} deactivated successfully.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error deactivating widget: ${err.message}`);
			throw new Error(`Error deactivating widget: ${err.message}`);
		}
	}

	// Update a widget
	async updateWidget(widgetName: string, updateData: any): Promise<void> {
		try {
			const fields = Object.entries(updateData)
				.map(([key, value]) => `${key} = ${value}`)
				.join(', ');

			const result = await db.execute(sql`
                UPDATE system_widgets
                SET ${fields}, updated_at = NOW()
                WHERE name = ${widgetName}
            `);

			if (result.rowCount === 0) {
				throw new Error(`Widget with name ${widgetName} not found or no changes applied.`);
			}

			logger.info(`Widget ${widgetName} updated successfully.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error updating widget: ${err.message}`);
			throw new Error(`Error updating widget: ${err.message}`);
		}
	}

	async findOne(collection: string, query: object): Promise<any> {
		const model = this.collectionsModels[collection];
		if (!model) {
			throw new Error(`Collection ${collection} does not exist.`);
		}
		return db.select().from(model).where(query).limit(1).execute();
	}

	async findMany(collection: string, query: object): Promise<any[]> {
		const model = this.collectionsModels[collection];
		if (!model) {
			throw new Error(`Collection ${collection} does not exist.`);
		}
		return db.select().from(model).where(query).execute();
	}

	async insertMany(collection: string, docs: object[]): Promise<any[]> {
		const model = this.collectionsModels[collection];
		if (!model) {
			throw new Error(`Collection ${collection} does not exist.`);
		}
		return db.insert(model).values(docs).execute();
	}

	async updateOne(collection: string, query: object, update: object): Promise<any> {
		const model = this.collectionsModels[collection];
		if (!model) {
			throw new Error(`Collection ${collection} does not exist.`);
		}
		return db.update(model).set(update).where(query).execute();
	}

	async updateMany(collection: string, query: object, update: object): Promise<any> {
		const model = this.collectionsModels[collection];
		if (!model) {
			throw new Error(`Collection ${collection} does not exist.`);
		}
		return db.update(model).set(update).where(query).execute();
	}

	async createDraft(content: any, originalDocumentId: string, userId: string): Promise<any> {
		const draftId = await this.generateId();
		const result = await db.execute(sql`
            INSERT INTO collection_drafts (id, original_document_id, content, created_by, status, created_at, updated_at)
            VALUES (${draftId}, ${originalDocumentId}, ${content}, ${userId}, 'draft', NOW(), NOW())
            RETURNING *
        `);
		return result[0];
	}

	async updateDraft(draftId: string, content: any): Promise<any> {
		const result = await db.execute(sql`
            UPDATE collection_drafts
            SET content = ${content}, updated_at = NOW()
            WHERE id = ${draftId}
            RETURNING *
        `);
		return result[0];
	}

	async publishDraft(draftId: string): Promise<any> {
		const result = await db.execute(sql`
            UPDATE collection_drafts
            SET status = 'published'
            WHERE id = ${draftId}
            RETURNING *
        `);

		const draft = result[0];
		const revisionId = await this.generateId();
		await db.execute(sql`
            INSERT INTO collection_revisions (id, document_id, content, created_by, created_at)
            VALUES (${revisionId}, ${draft.original_document_id}, ${draft.content}, ${draft.created_by}, NOW())
        `);
		return draft;
	}

	async getDraftsByUser(userId: string): Promise<any[]> {
		const result = await db.execute(sql`
            SELECT * FROM collection_drafts
            WHERE created_by = ${userId}
        `);
		return result;
	}

	async createRevision(documentId: string, content: any, userId: string): Promise<any> {
		const revisionId = await this.generateId();
		const result = await db.execute(sql`
            INSERT INTO collection_revisions (id, document_id, content, created_by, created_at)
            VALUES (${revisionId}, ${documentId}, ${content}, ${userId}, NOW())
            RETURNING *
        `);
		return result[0];
	}

	async getRevisions(documentId: string): Promise<any[]> {
		const result = await db.execute(sql`
            SELECT * FROM collection_revisions
            WHERE document_id = ${documentId}
            ORDER BY created_at DESC
        `);
		return result;
	}

	async disconnect(): Promise<void> {
		await dbClient.end();
		logger.info('Database connection closed.');
	}

	async getLastFiveCollections(): Promise<any[]> {
		const recentCollections: any[] = [];

		for (const [collectionName, model] of Object.entries(this.collectionsModels)) {
			const recentDocs = await db
				.select()
				.from(model)
				.orderBy(sql`created_at DESC`)
				.limit(5)
				.execute();
			recentCollections.push({ collectionName, recentDocs });
		}

		return recentCollections;
	}

	async getLoggedInUsers(): Promise<any[]> {
		const sessionModel = db.getTable('auth_sessions');
		const loggedInUsers = await db.select().from(sessionModel).where({ active: true }).execute();
		return loggedInUsers;
	}

	async getCMSData(): Promise<any> {
		// Implement your CMS data fetching logic here
		const cmsData = {}; // Replace with actual logic
		return cmsData;
	}

	async getLastFiveMedia(): Promise<any[]> {
		const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
		const recentMedia: any[] = [];

		for (const schemaName of mediaSchemas) {
			const model = db.getTable(schemaName);
			const recentDocs = await db
				.select()
				.from(model)
				.orderBy(sql`created_at DESC`)
				.limit(5)
				.execute();
			recentMedia.push({ schemaName, recentDocs });
			logger.info(`Fetched recent media documents for ${schemaName}`);
		}
		return recentMedia;
	}
}
