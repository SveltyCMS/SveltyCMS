import { privateEnv } from '@root/config/private';
import { Sequelize, DataTypes, Model, type ModelStatic } from 'sequelize';
import type { databaseAdapter } from './databaseAdapter';

export class MariaDBAdapter implements databaseAdapter {
	private sequelize: Sequelize;

	constructor() {
		this.sequelize = new Sequelize(privateEnv.DB_NAME, privateEnv.DB_USER, privateEnv.DB_PASSWORD, {
			host: privateEnv.DB_HOST,
			dialect: 'mariadb'
		});
	}

	// Connect to MariaDB database
	async connect(): Promise<void> {
		try {
			await this.sequelize.authenticate();
			console.log(`\x1b[32m====> Connection to ${privateEnv.DB_NAME} database successful!\x1b[0m`);
		} catch (error) {
			console.error('\x1b[31mError connecting to database:\x1b[0m', error);
			throw new Error('Error connecting to database');
		}
	}

	// Set up collections in the database using imported schemas
	async getCollectionModels(): Promise<any> {
		const collectionsModels: { [key: string]: ModelStatic<Model> } = {};

		// Simulating collections subscription
		const collections = [{ name: 'exampleCollection', fields: { field1: DataTypes.STRING, field2: DataTypes.INTEGER } }];

		collections.forEach((collection) => {
			if (!collection.name) return;

			collectionsModels[collection.name] = this.sequelize.define(
				collection.name,
				{
					...collection.fields,
					createdAt: {
						type: DataTypes.DATE,
						defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
					},
					updatedAt: {
						type: DataTypes.DATE,
						defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
					},
					createdBy: {
						type: DataTypes.STRING
					},
					__v: {
						type: DataTypes.JSON,
						defaultValue: []
					},
					translationStatus: {
						type: DataTypes.JSON
					}
				},
				{
					timestamps: true
				}
			);
		});

		return collectionsModels;
	}

	// Set up authentication collections if they don't already exist
	setupAuthModels(): void {
		const authUserModel = this.sequelize.define('auth_users', {
			// Define your schema here
		});

		const authTokenModel = this.sequelize.define('auth_tokens', {
			// Define your schema here
		});

		const authSessionModel = this.sequelize.define('auth_sessions', {
			// Define your schema here
		});

		// Ensure models are created in the database
		authUserModel.sync();
		authTokenModel.sync();
		authSessionModel.sync();
	}

	// Set up Media collections if they don't already exist
	setupMediaModels(): void {
		const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];

		mediaSchemas.forEach((schemaName) => {
			const mediaModel = this.sequelize.define(
				schemaName,
				{
					// Define your schema here
				},
				{
					timestamps: true
				}
			);

			// Ensure models are created in the database
			mediaModel.sync();
		});
	}
}
