/**
 * @file src/databases/drizzleDBAdapter.ts
 * @description Mock Drizzle ORM adapter for SQL databases in the CMS.
 */

import { collections } from '@root/src/stores/collectionStore.svelte';
import { logger } from '@utils/logger.svelte';
import type { Unsubscriber } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';

import { drizzle } from 'drizzle-orm/mariadb';
import { createConnection } from 'mariadb';

// Type definitions
interface QueryResult {
	rows: { data: Record<string, unknown> }[];
	affectedRows?: number;
}

const drizzleDbAdapter = new DrizzleDBAdapter();

export const db = {
	findOne: drizzleDbAdapter.findOne.bind(drizzleDbAdapter),
	findMany: drizzleDbAdapter.findMany.bind(drizzleDbAdapter),
	insertMany: drizzleDbAdapter.insertMany.bind(drizzleDbAdapter),
	updateOne: drizzleDbAdapter.updateOne.bind(drizzleDbAdapter),
	deleteOne: drizzleDbAdapter.deleteOne.bind(drizzleDbAdapter),
	count: drizzleDbAdapter.count.bind(drizzleDbAdapter)
};

export class DrizzleDBAdapter {
	private collectionsUnsubscriber: Unsubscriber | null = null;
	private db: any;

	async connect(connectionString: string): Promise<{ success: boolean; error?: Error }> {
		try {
			const connection = await createConnection(connectionString);
			this.db = drizzle(connection);
			logger.info('Drizzle database connection successful');
			return { success: true };
		} catch (error) {
			return { success: false, error: error as Error };
		}
	}

	async init(): Promise<void> {
		logger.debug('Initializing DrizzleDBAdapter...');
		this.collectionsUnsubscriber = collections.subscribe(async (collectionsData) => {
			for (const [contentTypes, collection] of Object.entries(collectionsData)) {
				if (collection && typeof collection === 'object') {
					await this.setupTable(contentTypes, collection as unknown as Record<string, unknown>);
				}
			}
		});
	}

	async setupTable(contentTypes: string, collection: Record<string, unknown>): Promise<void> {
		logger.debug(`Mock table setup for collection: ${contentTypes}`, collection);
	}

	async findOne(_collection: string, _query: object): Promise<Record<string, unknown> | null> {
		return null;
	}

	async findMany(_collection: string, _query: object): Promise<Record<string, unknown>[]> {
		return [];
	}

	async insertMany(_collection: string, docs: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
		return docs;
	}

	async updateOne(_collection: string, _query: object, update: object): Promise<Record<string, unknown> | null> {
		return update as Record<string, unknown>;
	}

	async updateMany(_collection: string, _query: object, _update: object): Promise<number> {
		return 0;
	}

	async deleteOne(_collection: string, _query: object): Promise<number> {
		return 0;
	}

	async deleteMany(_collection: string, _query: object): Promise<number> {
		return 0;
	}

	async count(_collection: string, _query?: object): Promise<number> {
		return 0;
	}

	async createDraft(content: Record<string, unknown>, originalDocumentId: string, userId: string): Promise<Record<string, unknown>> {
		const draftId = uuidv4();
		return { id: draftId, content, originalDocumentId, userId };
	}

	async updateDraft(draftId: string, content: Record<string, unknown>): Promise<Record<string, unknown>> {
		return { id: draftId, content };
	}

	async publishDraft(_draftId: string): Promise<Record<string, unknown>> {
		return { id: 'mock-id', content: {} };
	}

	async getDraftsByUser(_userId: string): Promise<Record<string, unknown>[]> {
		return [];
	}

	async createRevision(documentId: string, content: Record<string, unknown>, userId: string): Promise<Record<string, unknown>> {
		const revisionId = uuidv4();
		return { id: revisionId, documentId, content, userId };
	}

	async getRevisions(_documentId: string): Promise<Record<string, unknown>[]> {
		return [];
	}

	async saveWidget(_widgetData: Record<string, unknown>): Promise<void> {
		// Mock implementation
	}

	async getAllWidgets(): Promise<Record<string, unknown>[]> {
		return [];
	}

	async activateWidget(_widgetName: string): Promise<void> {
		// Mock implementation
	}

	async deactivateWidget(_widgetName: string): Promise<void> {
		// Mock implementation
	}

	async updateWidget(_widgetName: string, _updateData: Record<string, unknown>): Promise<void> {
		// Mock implementation
	}

	async setDefaultTheme(_themeName: string): Promise<void> {
		// Mock implementation
	}

	async saveThemes(_themes: Record<string, unknown>[]): Promise<void> {
		// Mock implementation
	}

	async getDefaultTheme(): Promise<Record<string, unknown> | null> {
		return null;
	}

	async getAllThemes(): Promise<Record<string, unknown>[]> {
		return [];
	}

	async disconnect(): Promise<void> {
		if (this.collectionsUnsubscriber) {
			this.collectionsUnsubscriber();
			this.collectionsUnsubscriber = null;
		}
		logger.info('Mock database disconnected');
	}
}
