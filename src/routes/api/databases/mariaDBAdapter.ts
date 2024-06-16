import { privateEnv } from '@root/config/private';
import mariadb from 'mariadb';
import type { Pool } from 'mariadb';
import type { DatabaseAdapter } from './databaseAdapter';

export class MariaDBAdapter implements DatabaseAdapter {
	private pool: Pool;

	constructor() {
		this.pool = mariadb.createPool({
			host: privateEnv.DB_HOST,
			user: privateEnv.DB_USER,
			password: privateEnv.DB_PASSWORD,
			database: privateEnv.DB_NAME,
			connectionLimit: privateEnv.DB_POOL_SIZE || 5
		});
	}

	// Connect to the MariaDB database
	async connect(): Promise<void> {
		try {
			await this.pool.getConnection();
			console.log('Successfully connected to the MariaDB database');
		} catch (error) {
			console.error('Failed to connect to the MariaDB database:', (error as Error).message);
			throw new Error(`Failed to connect to the MariaDB database: ${(error as Error).message}`);
		}
	}

	// Get collection models (tables) in the database
	async getCollectionModels(): Promise<Record<string, any>> {
		const connection = await this.pool.getConnection();
		try {
			const rows = await connection.query('SHOW TABLES');
			const tableNames = rows.map((row: any) => Object.values(row)[0]);
			const collectionModels: Record<string, any> = {};

			for (const tableName of tableNames) {
				collectionModels[tableName] = this.pool.query.bind(this.pool, `SELECT * FROM ${tableName}`);
			}

			return collectionModels;
		} finally {
			connection.release();
		}
	}

	// Set up authentication tables if they don't already exist
	async setupAuthModels(): Promise<void> {
		const connection = await this.pool.getConnection();
		try {
			await connection.query(`
				CREATE TABLE IF NOT EXISTS auth_users (
					id INT AUTO_INCREMENT PRIMARY KEY,
					email VARCHAR(255) NOT NULL,
					password VARCHAR(255) NOT NULL,
					created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
				)
			`);

			await connection.query(`
				CREATE TABLE IF NOT EXISTS auth_tokens (
					id INT AUTO_INCREMENT PRIMARY KEY,
					user_id INT NOT NULL,
					token VARCHAR(255) NOT NULL,
					created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
					FOREIGN KEY (user_id) REFERENCES auth_users(id)
				)
			`);

			await connection.query(`
				CREATE TABLE IF NOT EXISTS auth_sessions (
					id INT AUTO_INCREMENT PRIMARY KEY,
					user_id INT NOT NULL,
					session_token VARCHAR(255) NOT NULL,
					active BOOLEAN DEFAULT TRUE,
					created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
					FOREIGN KEY (user_id) REFERENCES auth_users(id)
				)
			`);
		} finally {
			connection.release();
		}
	}

	// Set up media tables if they don't already exist
	async setupMediaModels(): Promise<void> {
		const connection = await this.pool.getConnection();
		try {
			const mediaTables = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];

			for (const tableName of mediaTables) {
				await connection.query(`
					CREATE TABLE IF NOT EXISTS ${tableName} (
						id INT AUTO_INCREMENT PRIMARY KEY,
						data JSON,
						created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
					)
				`);
			}
		} finally {
			connection.release();
		}
	}

	// Fetch the last 5 added collections (tables)
	async getLastFiveCollections(): Promise<any[]> {
		const connection = await this.pool.getConnection();
		try {
			const tables = await connection.query('SHOW TABLES');
			const tableNames = tables.map((row: any) => Object.values(row)[0]);
			const recentCollections: any[] = [];

			for (const tableName of tableNames) {
				const recentDocs = await connection.query(`SELECT * FROM ${tableName} ORDER BY created_at DESC LIMIT 5`);
				recentCollections.push({ tableName, recentDocs });
			}

			return recentCollections;
		} finally {
			connection.release();
		}
	}

	// Fetch logged in users
	async getLoggedInUsers(): Promise<any[]> {
		const connection = await this.pool.getConnection();
		try {
			const loggedInUsers = await connection.query(`SELECT * FROM auth_sessions WHERE active = TRUE`);
			return loggedInUsers;
		} finally {
			connection.release();
		}
	}

	// Fetch the last 5 added media items
	async getLastFiveMedia(): Promise<any[]> {
		const connection = await this.pool.getConnection();
		try {
			const mediaTables = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
			const recentMedia: any[] = [];

			for (const tableName of mediaTables) {
				const recentDocs = await connection.query(`SELECT * FROM ${tableName} ORDER BY created_at DESC LIMIT 5`);
				recentMedia.push({ tableName, recentDocs });
			}

			return recentMedia;
		} finally {
			connection.release();
		}
	}
}
