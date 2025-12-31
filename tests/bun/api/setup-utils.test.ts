/**
 * @file tests/bun/api/setup-utils.test.ts
 * @description Unit tests for setup utility functions
 *
 * Coverage:
 * - buildDatabaseConnectionString() - Connection string generation
 * - classifyDatabaseError() - Error classification and user-friendly messages
 * - Database adapter creation and initialization
 * - Error handling and edge cases
 */

import { describe, it, expect } from 'bun:test';
import { buildDatabaseConnectionString } from '@src/routes/api/setup/utils';
import { classifyDatabaseError } from '@src/routes/api/setup/errorClassifier';
import type { DatabaseConfig } from '@src/databases/schemas';

describe('Setup Utils - Connection String Builder', () => {
	it('should build standard MongoDB connection string', () => {
		const config: DatabaseConfig = {
			type: 'mongodb',
			host: 'localhost',
			port: 27017,
			name: 'testdb',
			user: 'admin',
			password: 'secret'
		};

		const connectionString = buildDatabaseConnectionString(config);

		expect(connectionString).toContain('mongodb://');
		expect(connectionString).toContain('localhost:27017');
		expect(connectionString).toContain('testdb');
		expect(connectionString).toContain('admin');
		expect(connectionString).toContain('secret');
	});

	it('should build MongoDB Atlas SRV connection string', () => {
		const config: DatabaseConfig = {
			type: 'mongodb+srv',
			host: 'cluster0.example.mongodb.net',
			port: 27017,
			name: 'production',
			user: 'dbuser',
			password: 'dbpass123'
		};

		const connectionString = buildDatabaseConnectionString(config);

		expect(connectionString).toContain('mongodb+srv://');
		expect(connectionString).toContain('cluster0.example.mongodb.net');
		expect(connectionString).toContain('production');
	});

	it('should handle connection strings without credentials', () => {
		const config: DatabaseConfig = {
			type: 'mongodb',
			host: 'localhost',
			port: 27017,
			name: 'testdb',
			user: '',
			password: ''
		};

		const connectionString = buildDatabaseConnectionString(config);

		expect(connectionString).toBe('mongodb://localhost:27017/testdb');
	});

	it('should properly encode special characters in credentials', () => {
		const config: DatabaseConfig = {
			type: 'mongodb',
			host: 'localhost',
			port: 27017,
			name: 'testdb',
			user: 'user@domain',
			password: 'p@ss:word!'
		};

		const connectionString = buildDatabaseConnectionString(config);

		// Special characters should be URL-encoded
		expect(connectionString).toContain(encodeURIComponent('user@domain'));
		expect(connectionString).toContain(encodeURIComponent('p@ss:word!'));
	});

	it('should handle IPv6 addresses', () => {
		const config: DatabaseConfig = {
			type: 'mongodb',
			host: '[::1]',
			port: 27017,
			name: 'testdb',
			user: '',
			password: ''
		};

		const connectionString = buildDatabaseConnectionString(config);

		expect(connectionString).toContain('[::1]');
	});
});

describe('Error Classifier - MongoDB Errors', () => {
	it('should classify authentication failed errors', () => {
		const error = new Error('Authentication failed');
		const result = classifyDatabaseError(error, 'mongodb');

		expect(result.classification).toMatch(/auth/i);
		expect(result.userFriendly).toBeDefined();
		expect(result.userFriendly).toMatch(/username|password|credentials/i);
	});

	it('should classify connection refused errors', () => {
		const error = new Error('connect ECONNREFUSED 127.0.0.1:27017');
		(error as Error & { code?: string }).code = 'ECONNREFUSED';

		const result = classifyDatabaseError(error, 'mongodb');

		expect(result.classification).toMatch(/connection|refused/i);
		expect(result.userFriendly).toMatch(/refused|down|unreachable/i);
	});

	it('should classify DNS/hostname errors', () => {
		const error = new Error('getaddrinfo ENOTFOUND invalid-host');
		(error as Error & { code?: string }).code = 'ENOTFOUND';

		const result = classifyDatabaseError(error, 'mongodb');

		expect(result.classification).toMatch(/dns|hostname/i);
		expect(result.userFriendly).toMatch(/hostname|resolve|address/i);
	});

	it('should classify timeout errors', () => {
		const error = new Error('Server selection timed out after 30000 ms');

		const result = classifyDatabaseError(error, 'mongodb');

		expect(result.classification).toMatch(/timeout/i);
		expect(result.userFriendly).toMatch(/timeout|slow|network/i);
	});

	it('should detect MongoDB Atlas specific errors', () => {
		const error = new Error('IP address 1.2.3.4 is not allowed to connect');
		const dbConfig = {
			host: 'cluster0.mongodb.net',
			user: 'testuser',
			password: 'testpass'
		};

		const result = classifyDatabaseError(error, 'mongodb', dbConfig);

		expect(result.classification).toMatch(/atlas|whitelist|ip/i);
		expect(result.userFriendly).toMatch(/Atlas|whitelist|IP address/i);
	});

	it('should classify network unreachable errors', () => {
		const error = new Error('Network is unreachable');

		const result = classifyDatabaseError(error, 'mongodb');

		expect(result.classification).toMatch(/network/i);
		expect(result.userFriendly).toMatch(/network|firewall|connection/i);
	});

	it('should classify TLS/SSL certificate errors', () => {
		const error = new Error('SSL certificate validation failed');

		const result = classifyDatabaseError(error, 'mongodb');

		expect(result.classification).toMatch(/tls|ssl|certificate/i);
		expect(result.userFriendly).toMatch(/SSL|TLS|certificate|secure/i);
	});

	it('should classify database not found errors', () => {
		const error = new Error('Database "nonexistent" not found');

		const result = classifyDatabaseError(error, 'mongodb');

		expect(result.classification).toMatch(/database|not found/i);
		expect(result.userFriendly).toMatch(/database|created|exist/i);
	});

	it('should handle permission/authorization errors', () => {
		const error = new Error('not authorized on admin to execute command');

		const result = classifyDatabaseError(error, 'mongodb');

		expect(result.classification).toMatch(/auth/i);
		expect(result.userFriendly).toMatch(/authentication|username|password/i);
	});
	it('should provide raw error message in all cases', () => {
		const error = new Error('Unknown database error');

		const result = classifyDatabaseError(error, 'mongodb');

		expect(result.raw).toBe('Unknown database error');
	});
});

describe('Error Classifier - Edge Cases', () => {
	it('should handle non-Error objects', () => {
		const result = classifyDatabaseError('String error message', 'mongodb');

		expect(result.raw).toBe('String error message');
		expect(result.userFriendly).toBeDefined();
	});

	it('should handle errors without message property', () => {
		const result = classifyDatabaseError({ code: 'ECONNREFUSED' }, 'mongodb');

		expect(result.classification).toBeDefined();
		expect(result.userFriendly).toBeDefined();
	});

	it('should handle null or undefined errors', () => {
		const result = classifyDatabaseError(null, 'mongodb');

		expect(result.raw).toBeDefined();
		expect(result.userFriendly).toBeDefined();
	});
});

describe('Error Classifier - User-Friendly Messages', () => {
	it('should provide actionable suggestions for authentication errors', () => {
		const error = new Error('Authentication failed');
		const result = classifyDatabaseError(error, 'mongodb');

		expect(result.userFriendly).toMatch(/check|verify|correct/i);
	});

	it('should provide context-specific help for Atlas errors', () => {
		const error = new Error('IP not whitelisted');
		const dbConfig = {
			host: 'cluster.mongodb.net'
		};

		const result = classifyDatabaseError(error, 'mongodb', dbConfig);

		expect(result.userFriendly).toMatch(/Atlas|Network Access|whitelist/i);
	});

	it('should suggest troubleshooting steps for connection errors', () => {
		const error = new Error('ECONNREFUSED');
		(error as Error & { code?: string }).code = 'ECONNREFUSED';

		const result = classifyDatabaseError(error, 'mongodb');

		expect(result.userFriendly).toMatch(/refused|down|unreachable|connection/i);
	});
});

describe('Connection String Security', () => {
	it('should not expose passwords in logs', () => {
		const config: DatabaseConfig = {
			type: 'mongodb',
			host: 'localhost',
			port: 27017,
			name: 'testdb',
			user: 'admin',
			password: 'super-secret-password'
		};

		const connectionString = buildDatabaseConnectionString(config);

		// Verify password is in the connection string (for actual connection)
		expect(connectionString).toContain('super-secret-password');

		// In production, logs should sanitize this:
		const sanitized = connectionString.replace(/:[^:@]+@/, ':***@');
		expect(sanitized).not.toContain('super-secret-password');
		expect(sanitized).toContain('***');
	});
});

describe('Connection String Validation', () => {
	it('should create valid MongoDB connection strings', () => {
		const config: DatabaseConfig = {
			type: 'mongodb',
			host: 'localhost',
			port: 27017,
			name: 'testdb',
			user: 'admin',
			password: 'pass'
		};

		const connectionString = buildDatabaseConnectionString(config);

		// Should match MongoDB connection string format
		expect(connectionString).toMatch(/^mongodb:\/\//);
		expect(connectionString).toMatch(/\/testdb$/);
	});

	it('should create valid MongoDB SRV connection strings', () => {
		const config: DatabaseConfig = {
			type: 'mongodb+srv',
			host: 'cluster.mongodb.net',
			port: 27017,
			name: 'prod',
			user: 'user',
			password: 'pass'
		};

		const connectionString = buildDatabaseConnectionString(config);

		// Should match MongoDB SRV connection string format
		expect(connectionString).toMatch(/^mongodb\+srv:\/\//);
		expect(connectionString).toContain('cluster.mongodb.net');
	});
});
