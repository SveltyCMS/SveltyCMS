import { privateEnv } from '@root/config/private';
import mariadb from 'mariadb';
import type { databaseAdapter } from './databaseAdapter';

export class MariaDBAdapter implements databaseAdapter {
	private pool: mariadb.Pool;

	constructor() {
		this.pool = mariadb.createPool({
			host: privateEnv.DB_HOST,
			user: privateEnv.DB_USER,
			password: privateEnv.DB_PASSWORD,
			database: privateEnv.DB_NAME,
			connectionLimit: 5
		});
	}

	async connect(): Promise<void> {
		try {
			const connection = await this.pool.getConnection();
			console.log(`\x1b[32m====> Connection to ${privateEnv.DB_NAME} database successful!\x1b[0m`);
			connection.release();
		} catch (error) {
			console.error('\x1b[31mError connecting to database:\x1b[0m', error);
			throw new Error('Error connecting to database');
		}
	}

	async getCollectionModels(): Promise<any> {
		const collectionsModels: { [key: string]: any } = {};

		const collections = [{ name: 'exampleCollection', fields: { field1: 'VARCHAR(255)', field2: 'INT' } }];

		for (const collection of collections) {
			if (!collection.name) continue;

			const createTableQuery = `
                CREATE TABLE IF NOT EXISTS ${collection.name} (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    field1 VARCHAR(255),
                    field2 INT,
                    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    createdBy VARCHAR(255),
                    __v JSON,
                    translationStatus JSON
                )
            `;

			await this.pool.query(createTableQuery);
			collectionsModels[collection.name] = collection;
		}

		return collectionsModels;
	}

	async setupAuthModels(): Promise<void> {
		const createUsersTable = `
            CREATE TABLE IF NOT EXISTS auth_users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(255) NOT NULL,
                username VARCHAR(255),
                avatar VARCHAR(255),
                lastAuthMethod VARCHAR(255),
                lastActiveAt TIMESTAMP,
                expiresAt TIMESTAMP,
                is_registered BOOLEAN,
                blocked BOOLEAN,
                resetRequestedAt TIMESTAMP,
                resetToken VARCHAR(255),
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `;

		const createTokensTable = `
            CREATE TABLE IF NOT EXISTS auth_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                token VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                expires TIMESTAMP NOT NULL,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `;

		const createSessionsTable = `
            CREATE TABLE IF NOT EXISTS auth_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                expires TIMESTAMP NOT NULL,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `;

		await this.pool.query(createUsersTable);
		await this.pool.query(createTokensTable);
		await this.pool.query(createSessionsTable);
	}

	async setupMediaModels(): Promise<void> {
		const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];

		for (const schemaName of mediaSchemas) {
			const createTableQuery = `
                CREATE TABLE IF NOT EXISTS ${schemaName} (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    createdBy VARCHAR(255),
                    __v JSON,
                    translationStatus JSON
                )
            `;

			await this.pool.query(createTableQuery);
		}
	}

	async getAuthModel(name: string): Promise<any> {
		const query = `
            SELECT * FROM ${name}
        `;
		try {
			const rows = await this.pool.query(query);
			return rows;
		} catch (error) {
			console.error(`\x1b[31mError retrieving ${name} model:\x1b[0m`, error);
			throw new Error(`Error retrieving ${name} model`);
		}
	}
}
