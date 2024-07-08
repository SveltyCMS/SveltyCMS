import { privateEnv } from '@root/config/private';
import { createRandomID } from '@src/utils/utils';

// Stores
import { collections } from '@stores/store';
import type { Unsubscriber } from 'svelte/store';

// Drizzle
import type { dbInterface } from './dbInterface';
import { createConnectionPool, sql } from 'drizzle-orm';

import * as mariadb from 'drizzle-orm/mariadb';
import * as postgres from 'drizzle-orm/postgres';

// Import logger
import logger from '@utils/logger';

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
const db = createConnection(dbClient);

export class DrizzleDBAdapter implements dbInterface {
	private unsubscribe: Unsubscriber | undefined;

	async connect(attempts: number = privateEnv.DB_RETRY_ATTEMPTS || 3): Promise<void> {
		while (attempts > 0) {
			try {
				await dbClient.raw('SELECT 1');
				logger.info(`Successfully connected to ${privateEnv.DB_NAME}`);
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

	async generateId(): Promise<string> {
		return createRandomID();
	}

	async getCollectionModels(): Promise<any> {
		return new Promise<any>((resolve) => {
			this.unsubscribe = collections.subscribe(async (collections) => {
				if (collections) {
					const collectionsModels: { [key: string]: any } = {};

					for (const collection of Object.values(collections)) {
						if (!collection.name) continue;

						const schema = {
							// Define schema here
							id: 'string'
							// Add other fields dynamically
						};

						const model = db.defineModel(collection.name, schema);
						collectionsModels[collection.name] = model;
						logger.info(`Collection model for ${collection.name} set up.`);
					}

					this.unsubscribe && this.unsubscribe();
					this.unsubscribe = undefined;
					logger.info('Collection models setup complete.');
					resolve(collectionsModels);
				}
			});
		});
	}

	// Set up authentication models
	setupAuthModels(): void {
		// Define your auth models setup here
	}

	// Set up media models
	setupMediaModels(): void {
		// Define your media models setup here
	}

	async findOne(collection: string, query: object): Promise<any> {
		const model = db.getModel(collection);
		if (!model) {
			throw new Error(`Collection ${collection} does not exist.`);
		}
		return model.findOne(query);
	}

	async insertMany(collection: string, docs: object[]): Promise<any[]> {
		const model = db.getModel(collection);
		if (!model) {
			throw new Error(`Collection ${collection} does not exist.`);
		}
		const result = await model.insertMany(docs);
		return result;
	}

	async createDraft(content: any, originalDocumentId: string, userId: string): Promise<any> {
		const draftId = await this.generateId();
		const result = await db.query(sql`
			INSERT INTO drafts (id, original_document_id, content, created_by, status)
			VALUES (${draftId}, ${originalDocumentId}, ${content}, ${userId}, 'draft')
			RETURNING *
		`);
		return result.rows[0];
	}

	async updateDraft(draftId: string, content: any): Promise<any> {
		const result = await db.query(sql`
			UPDATE drafts
			SET content = ${content}, updated_at = NOW()
			WHERE id = ${draftId}
			RETURNING *
		`);
		return result.rows[0];
	}

	async publishDraft(draftId: string): Promise<any> {
		const result = await db.query(sql`
			UPDATE drafts
			SET status = 'published'
			WHERE id = ${draftId}
			RETURNING *
		`);

		const draft = result.rows[0];
		const revisionId = await this.generateId();
		await db.query(sql`
			INSERT INTO revisions (id, document_id, content, created_by)
			VALUES (${revisionId}, ${draft.original_document_id}, ${draft.content}, ${draft.created_by})
		`);
		return draft;
	}

	async getDraftsByUser(userId: string): Promise<any[]> {
		const result = await db.query(sql`
			SELECT * FROM drafts
			WHERE created_by = ${userId}
		`);
		return result.rows;
	}

	async createRevision(documentId: string, content: any, userId: string): Promise<any> {
		const revisionId = await this.generateId();
		const result = await db.query(sql`
			INSERT INTO revisions (id, document_id, content, created_by)
			VALUES (${revisionId}, ${documentId}, ${content}, ${userId})
			RETURNING *
		`);
		return result.rows[0];
	}

	async getRevisions(documentId: string): Promise<any[]> {
		const result = await db.query(sql`
			SELECT * FROM revisions
			WHERE document_id = ${documentId}
			ORDER BY created_at DESC
		`);
		return result.rows;
	}

	async disconnect(): Promise<void> {
		await dbClient.destroy();
		logger.info('Database connection closed.');
	}

	// Get recent last 5 collections
	async getLastFiveCollections(): Promise<any[]> {
		const collections = await db.listTables();
		const recentCollections: any[] = [];

		for (const collectionName of collections) {
			const model = db.getModel(collectionName);
			const recentDocs = await model.find().orderBy('createdAt', 'desc').limit(5);
			recentCollections.push({ collectionName, recentDocs });
		}

		return recentCollections;
	}

	// Get logged in users
	async getLoggedInUsers(): Promise<any[]> {
		const sessionModel = db.getModel('auth_sessions');
		const loggedInUsers = await sessionModel.find({ active: true });
		return loggedInUsers;
	}

	// Get CMS data
	async getCMSData(): Promise<any> {
		const cmsData = {}; // Replace with actual logic
		return cmsData;
	}

	// Get recent last 5 media documents
	async getLastFiveMedia(): Promise<any[]> {
		const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
		const recentMedia: any[] = [];

		for (const schemaName of mediaSchemas) {
			const model = db.getModel(schemaName);
			const recentDocs = await model.find().orderBy('createdAt', 'desc').limit(5);
			recentMedia.push({ schemaName, recentDocs });
			logger.info(`Fetched recent media documents for ${schemaName}`);
		}
		return recentMedia;
	}
}
