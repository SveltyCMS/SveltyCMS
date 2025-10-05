#!/usr/bin/env node

/**
 * MongoDB Connection Diagnostic Tool
 *
 * This script checks MongoDB connectivity and diagnoses common issues.
 * Run with: node scripts/check-mongodb.js
 */

import { MongoClient } from 'mongodb';
import { join } from 'path';

const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m'
};

function log(message, color = '') {
	console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
	console.log('\n' + '='.repeat(60));
	log(title, colors.bright + colors.cyan);
	console.log('='.repeat(60));
}

function logSuccess(message) {
	log(`✓ ${message}`, colors.green);
}

function logError(message) {
	log(`✗ ${message}`, colors.red);
}

function logWarning(message) {
	log(`⚠ ${message}`, colors.yellow);
}

function logInfo(message) {
	log(`ℹ ${message}`, colors.blue);
}

async function checkMongoDBConnection() {
	logSection('MongoDB Connection Diagnostic Tool');

	// Step 1: Load private config
	logSection('Step 1: Loading Configuration');
	let config;
	try {
		const configPath = join(process.cwd(), 'config', 'private.ts');
		logInfo(`Reading config from: ${configPath}`);

		// Try environment variables first (works in all cases)
		const envConfig = {
			DB_TYPE: process.env.DB_TYPE || 'mongodb',
			DB_HOST: process.env.DB_HOST || 'localhost',
			DB_PORT: process.env.DB_PORT || '27017',
			DB_NAME: process.env.DB_NAME || 'sveltycms',
			DB_USER: process.env.DB_USER || '',
			DB_PASSWORD: process.env.DB_PASSWORD || ''
		};

		// Try to dynamically import the compiled config (after build)
		try {
			const configModule = await import('../.svelte-kit/output/server/chunks/private.js');
			config = configModule.privateEnv;
			logSuccess('Configuration loaded from built output');
		} catch {
			// Fallback to environment or defaults
			if (process.env.DB_HOST) {
				config = envConfig;
				logSuccess('Configuration loaded from environment variables');
			} else {
				config = envConfig;
				logWarning('Using default configuration (localhost:27017/sveltycms)');
				logInfo('To use custom config: set environment variables or build the project first');
			}
		}

		if (!config) {
			logError('Configuration could not be loaded');
			process.exit(1);
		}

		logInfo(`DB Type: ${config.DB_TYPE}`);
		logInfo(`DB Host: ${config.DB_HOST || 'localhost'}`);
		logInfo(`DB Port: ${config.DB_PORT || '27017'}`);
		logInfo(`DB Name: ${config.DB_NAME || 'sveltycms'}`);
		logInfo(`DB User: ${config.DB_USER ? '***' : '(none)'}`);
		logInfo(`DB Password: ${config.DB_PASSWORD ? '***' : '(none)'}`);
	} catch (error) {
		logError(`Failed to load configuration: ${error.message}`);
		logWarning('Make sure you have built the project (bun run build) or set environment variables');
		logInfo('Environment variables: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD');
		process.exit(1);
	}

	// Step 2: Build connection string
	logSection('Step 2: Building Connection String');
	let connectionString;
	try {
		const hasAuth = config.DB_USER && config.DB_PASSWORD;
		const authPart = hasAuth ? `${encodeURIComponent(config.DB_USER)}:${encodeURIComponent(config.DB_PASSWORD)}@` : '';
		const host = config.DB_HOST || 'localhost';
		const port = config.DB_PORT || 27017;
		const dbName = config.DB_NAME || 'sveltycms';
		const authSource = hasAuth ? '?authSource=admin' : '';

		connectionString = `mongodb://${authPart}${host}:${port}/${dbName}${authSource}`;

		logSuccess('Connection string built successfully');
		// Mask password in output
		const displayString = connectionString.replace(/:([^@]+)@/, ':***@');
		logInfo(`Connection string: ${displayString}`);
	} catch (error) {
		logError(`Failed to build connection string: ${error.message}`);
		process.exit(1);
	}

	// Step 3: Test connection
	logSection('Step 3: Testing MongoDB Connection');
	let client;
	try {
		logInfo('Attempting to connect...');

		client = new MongoClient(connectionString, {
			serverSelectionTimeoutMS: 5000,
			connectTimeoutMS: 10000
		});

		await client.connect();
		logSuccess('Successfully connected to MongoDB');

		// Test database access
		logInfo('Testing database access...');
		const db = client.db();
		await db.admin().ping();
		logSuccess('Database ping successful');

		// Get server info
		const serverInfo = await db.admin().serverStatus();
		logInfo(`MongoDB Version: ${serverInfo.version}`);
		logInfo(`Uptime: ${Math.floor(serverInfo.uptime / 60)} minutes`);

		// List collections
		logInfo('Checking collections...');
		const collections = await db.listCollections().toArray();
		logSuccess(`Found ${collections.length} collections`);

		if (collections.length > 0) {
			logInfo('Collections:');
			collections.forEach((col) => {
				console.log(`  - ${col.name}`);
			});
		}

		// Check virtual folders specifically
		logSection('Step 4: Checking Virtual Folders');
		try {
			const virtualFoldersCollection = db.collection('systemvirtualfolders');
			const count = await virtualFoldersCollection.countDocuments();

			if (count === 0) {
				logWarning('No virtual folders found - system will create default folder on startup');
			} else {
				logSuccess(`Found ${count} virtual folder(s)`);
				const folders = await virtualFoldersCollection.find({}).limit(5).toArray();
				logInfo('Sample folders:');
				folders.forEach((folder) => {
					console.log(`  - ${folder.name} (${folder.path})`);
				});
			}
		} catch (error) {
			logWarning(`Could not check virtual folders: ${error.message}`);
			logInfo('This is normal if the collection does not exist yet');
		}

		logSection('Summary');
		logSuccess('All checks passed! MongoDB is accessible and working correctly.');
		logInfo('Your SveltyCMS should be able to connect successfully.');
	} catch (error) {
		logSection('Connection Failed');
		logError(`Failed to connect to MongoDB: ${error.message}`);

		console.log('\nCommon Issues and Solutions:');
		console.log('');

		if (error.message.includes('ECONNREFUSED')) {
			logWarning('Connection refused - MongoDB server is not running or not accessible');
			console.log('\nSolutions:');
			console.log('  1. Start MongoDB:');
			console.log('     - Linux/Mac: sudo systemctl start mongod');
			console.log('     - Mac (brew): brew services start mongodb-community');
			console.log('     - Windows: net start MongoDB');
			console.log('  2. Check if MongoDB is running: ps aux | grep mongod');
			console.log('  3. Verify MongoDB is listening on the correct port');
		} else if (error.message.includes('authentication failed')) {
			logWarning('Authentication failed - check your username and password');
			console.log('\nSolutions:');
			console.log('  1. Verify DB_USER and DB_PASSWORD in config/private.ts');
			console.log('  2. Check MongoDB user permissions');
			console.log('  3. Ensure authSource is correct (default: admin)');
		} else if (error.message.includes('ETIMEDOUT') || error.message.includes('timed out')) {
			logWarning('Connection timed out - check network and firewall');
			console.log('\nSolutions:');
			console.log('  1. Verify MongoDB host and port are correct');
			console.log('  2. Check firewall rules: sudo ufw status');
			console.log('  3. If remote MongoDB, ensure it accepts remote connections');
			console.log('  4. Check bindIp in /etc/mongod.conf');
		} else if (error.message.includes('Unknown server')) {
			logWarning('Server selection error - MongoDB not responding');
			console.log('\nSolutions:');
			console.log('  1. Check if MongoDB process is running');
			console.log('  2. Verify connection string format');
			console.log('  3. Check MongoDB logs: tail -f /var/log/mongodb/mongod.log');
		}

		console.log('\nAdditional Diagnostics:');
		console.log('');
		console.log('  Check MongoDB status:');
		console.log('    sudo systemctl status mongod');
		console.log('');
		console.log('  View MongoDB logs:');
		console.log('    tail -f /var/log/mongodb/mongod.log');
		console.log('');
		console.log('  Test connection manually:');
		console.log(`    mongosh --host ${config.DB_HOST || 'localhost'} --port ${config.DB_PORT || 27017}`);
		console.log('');

		process.exit(1);
	} finally {
		if (client) {
			await client.close();
			logInfo('Connection closed');
		}
	}
}

// Run the diagnostic
checkMongoDBConnection().catch((error) => {
	logError(`Unexpected error: ${error.message}`);
	console.error(error);
	process.exit(1);
});
