import mongoose from 'mongoose';
import inquirer from 'inquirer';

export async function testDatabaseConnection(dbOption, connectionStringDetails) {
	try {
		let connectionString;
		const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, DB_COMPRESSOR } = connectionStringDetails;

		switch (dbOption) {
			case 'docker':
				// Connection string for MongoDB on Docker
				connectionString = `${DB_HOST}${DB_NAME}`;
				break;
			case 'atlas':
				// Connection string for MongoDB Atlas
				connectionString = connectionStringDetails.atlasConnectionString;
				break;
			case 'local':
				// Connection string for local MongoDB instance
				connectionString = `${DB_HOST}${DB_NAME}`;
				break;
			default:
				console.error('Invalid database option.');
				return false;
		}

		await mongoose.connect(connectionString, options);
		console.log('Database connection successful!');
		await mongoose.connection.db.admin().ping();
		console.log('Database ping successful!');
		return true;
	} catch (error) {
		console.error('Database connection failed:', error);
		const { retry } = await inquirer.prompt({
			type: 'confirm',
			name: 'retry',
			message: 'Retry connecting to the database?',
			default: true
		});
		if (retry) {
			// Retry database connection
			return testDatabaseConnection(dbOption, connectionStringDetails);
		} else {
			console.log('Exiting...');
			process.exit(1); // Exit the process
		}
	}
}
