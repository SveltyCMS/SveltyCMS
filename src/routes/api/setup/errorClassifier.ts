/**
 * @file src/routes/api/setup/errorClassifier.ts
 * @description Centralized database error classification for all supported DB engines.
 */

import { logger } from '@utils/logger.svelte';

export interface ClassifiedError {
	classification: string;
	raw: string;
	userFriendly: string;
}

export function classifyDatabaseError(
	err: unknown,
	engine: 'mongodb' | 'postgres' | 'mysql' | 'sqlite',
	dbConfig?: { user?: string; password?: string; host?: string }
): ClassifiedError {
	const raw = err instanceof Error ? err.message : String(err);
	const lower = raw.toLowerCase();
	const code = (err as { code?: string | number })?.code ?? '';

	// Log the raw error for debugging
	logger.error('🔍 Classifying database error:', { raw, lower, code, engine });

	// 🎯 MongoDB Atlas specific errors (check first for most specific errors)
	if (engine === 'mongodb' && dbConfig?.host?.includes('mongodb.net')) {
		// TLS/SSL errors for Atlas
		if (/tls|ssl|certificate|self[- ]?signed/i.test(lower)) {
			return {
				classification: 'atlas_tls_error',
				raw,
				userFriendly:
					'MongoDB Atlas TLS/SSL connection error. This usually happens due to: 1) Network firewall blocking the connection, 2) Outdated Node.js TLS configuration, or 3) Certificate validation issues. Try adding "retryWrites=true&w=majority" to your connection options, or check your Node.js version (requires Node.js 14.20+, 16.14+, or 18+).'
			};
		}
		// Common Atlas-specific issues
		if (/ip.*whitelist|ip.*not.*allowed|network.*access|not.*authorized.*from.*ip/i.test(lower)) {
			return {
				classification: 'atlas_ip_whitelist',
				raw,
				userFriendly:
					'Your IP address is not whitelisted in MongoDB Atlas. Go to Network Access in your Atlas dashboard and add your current IP address (0.0.0.0/0 for testing, or your specific IP for production).'
			};
		}
		if (/cluster.*not.*found|hostname.*not.*found|srv.*lookup.*failed/i.test(lower)) {
			return {
				classification: 'atlas_cluster_not_found',
				raw,
				userFriendly: 'MongoDB Atlas cluster not found. Please check your connection string and ensure the cluster name is correct.'
			};
		}
		if (/user.*not.*found|authentication.*failed.*user/i.test(lower)) {
			return {
				classification: 'atlas_user_not_found',
				raw,
				userFriendly:
					'Database user not found in Atlas. Go to Database Access in your Atlas dashboard and create a database user with read/write permissions.'
			};
		}
	}

	// 🔍 Authentication patterns (most specific first)
	if (/authentication failed|auth.*fail|bad auth|authentication.*error/i.test(lower)) {
		return { classification: 'authentication_failed', raw, userFriendly: 'Authentication failed. Please check your username and password.' };
	}
	if (/user.*not found|username.*not found|no.*user/i.test(lower)) {
		return { classification: 'user_not_found', raw, userFriendly: 'User not found. Please check your username.' };
	}
	if (/wrong.*password|incorrect.*password|password.*incorrect|bad.*password/i.test(lower)) {
		return { classification: 'wrong_password', raw, userFriendly: 'Incorrect password. Please check your password.' };
	}
	if (/no.*password|password.*required|password.*missing/i.test(lower)) {
		return { classification: 'password_required', raw, userFriendly: 'Password required. Please provide a password for this user.' };
	}
	if (/command.*failed.*authentication|operation.*failed.*authentication|not.*authorized.*command|command.*not.*authorized/i.test(lower)) {
		return {
			classification: 'auth_required',
			raw,
			userFriendly: 'Authentication required. This database instance requires a username and password.'
		};
	}
	if (/credentials.*required|authentication.*required|auth.*required|must.*authenticate/i.test(lower)) {
		return { classification: 'credentials_required', raw, userFriendly: 'Authentication required. Please provide your username and password.' };
	}
	if (/not authorized|unauthorized|permission.*denied/i.test(lower)) {
		return { classification: 'not_authorized', raw, userFriendly: 'Not authorized. The user may lack necessary permissions for this database.' };
	}
	if (/access.*denied|command.*not allowed|not allowed/i.test(lower)) {
		return { classification: 'access_denied', raw, userFriendly: 'Access denied. The user lacks permission to perform this operation.' };
	}

	// 🔍 Connection errors
	if (/econnrefused|connection refused/i.test(lower) || code === 'ECONNREFUSED') {
		return { classification: 'connection_refused', raw, userFriendly: 'Connection refused. The database server may be down or unreachable.' };
	}
	if (/enotfound|getaddrinfo|dns.*fail|host.*not.*found/i.test(lower) || code === 'ENOTFOUND') {
		return { classification: 'dns_not_found', raw, userFriendly: 'Host not found. Please check your hostname or IP address.' };
	}
	if (/timed out|timeout|server selection timed out/i.test(lower)) {
		return { classification: 'timeout', raw, userFriendly: 'Connection timeout. Please check your connection and try again.' };
	}
	if (/network.*error|network.*unreachable/i.test(lower)) {
		return { classification: 'network_error', raw, userFriendly: 'Network error. Please check your connection.' };
	}

	// 🔍 TLS/SSL errors
	if (/tls|ssl|certificate/i.test(lower)) {
		return { classification: 'tls_error', raw, userFriendly: 'TLS/SSL connection error. Please check your connection security settings.' };
	}

	// 🔍 URI/Connection string errors
	if (/uri malformed|invalid connection string|must begin with|invalid scheme/i.test(lower)) {
		return { classification: 'invalid_uri', raw, userFriendly: 'Invalid connection string format. Please check your connection URI.' };
	}
	if (/unable to parse|invalid port|port.*invalid/i.test(lower)) {
		return { classification: 'invalid_port', raw, userFriendly: 'Invalid port number. Please check your port configuration.' };
	}
	if (/invalid hostname|hostname.*invalid/i.test(lower)) {
		return { classification: 'invalid_hostname', raw, userFriendly: 'Invalid hostname. Please check your host configuration.' };
	}

	// 🔍 Database-specific errors
	if (/database.*not found|db.*not found/i.test(lower)) {
		return {
			classification: 'database_not_found',
			raw,
			userFriendly: 'Database not found. The database may not exist or you may lack permission to access it.'
		};
	}

	// 🔍 Engine-specific refinements
	switch (engine) {
		case 'mongodb':
			// MongoDB-specific patterns
			if (/replica set|replicaset/i.test(lower)) {
				return {
					classification: 'replica_set_error',
					raw,
					userFriendly: 'Replica set configuration error. Please check your MongoDB cluster setup.'
				};
			}
			if (/server.*selection.*error|no.*server.*available/i.test(lower)) {
				return { classification: 'server_selection_error', raw, userFriendly: 'Server selection failed. The MongoDB server may be unreachable.' };
			}
			if (/sasl.*authentication|sasl.*auth.*fail|sasl.*error/i.test(lower)) {
				return {
					classification: 'sasl_auth_error',
					raw,
					userFriendly: 'SASL authentication failed. Please check your credentials and authentication method.'
				};
			}
			if (/authentication.*database|authsource|auth.*source/i.test(lower)) {
				return {
					classification: 'auth_database_error',
					raw,
					userFriendly: 'Authentication database error. Please check your authentication source configuration.'
				};
			}
			// Check for common MongoDB connection failures when auth is likely required
			if (/connection.*failed|server.*not.*available|could.*not.*connect/i.test(lower)) {
				if (dbConfig && !dbConfig.user && !dbConfig.password && (dbConfig.host === 'localhost' || dbConfig.host === '127.0.0.1')) {
					return {
						classification: 'likely_auth_required',
						raw,
						userFriendly: 'Connection failed. If your MongoDB instance requires authentication, please provide a username and password.'
					};
				}
			}
			if (/mongo|mongoose/i.test(lower)) {
				return {
					classification: 'mongodb_error',
					raw,
					userFriendly: 'MongoDB server error. Please check your connection settings and database configuration.'
				};
			}
			break;

		case 'postgres':
			// PostgreSQL error codes
			if (code === '28P01')
				return { classification: 'authentication_failed', raw, userFriendly: 'Authentication failed. Please check your username and password.' };
			if (code === '3D000')
				return { classification: 'database_not_found', raw, userFriendly: 'Database not found. Please check your database name.' };
			if (code === '28000')
				return { classification: 'auth_required', raw, userFriendly: 'Authentication required. Please provide valid credentials.' };
			break;

		case 'mysql':
			// MySQL error codes and patterns
			if (code === 'ER_ACCESS_DENIED_ERROR' || /access denied/i.test(lower)) {
				return { classification: 'authentication_failed', raw, userFriendly: 'Authentication failed. Please check your username and password.' };
			}
			if (code === 'ER_DBACCESS_DENIED_ERROR') {
				return { classification: 'not_authorized', raw, userFriendly: 'Access denied to database. Please check your permissions.' };
			}
			if (code === 'ER_BAD_DB_ERROR' || /unknown database/i.test(lower)) {
				return { classification: 'database_not_found', raw, userFriendly: 'Database not found. Please check your database name.' };
			}
			break;

		case 'sqlite':
			// SQLite patterns
			if (/no such file|file.*not.*found/i.test(lower)) {
				return { classification: 'file_not_found', raw, userFriendly: 'Database file not found. Please check the file path.' };
			}
			if (/permission.*denied|access.*denied/i.test(lower)) {
				return { classification: 'permission_denied', raw, userFriendly: 'Permission denied. Please check file permissions.' };
			}
			break;
	}

	// 🔍 Generic catch-all patterns
	if (/auth|authentication|credential|password|username|user.*name/i.test(lower)) {
		return {
			classification: 'auth_general',
			raw,
			userFriendly: 'Authentication issue detected. Please check your username and password, or verify if authentication is required.'
		};
	}

	// 🔍 Special case: Check if this might be an auth-required scenario
	if (dbConfig && !dbConfig.user && !dbConfig.password) {
		// No credentials provided - check for patterns that suggest auth is required
		if (/connection.*failed|server.*not.*available|could.*not.*connect|failed.*to.*connect/i.test(lower)) {
			if (dbConfig.host === 'localhost' || dbConfig.host === '127.0.0.1') {
				return {
					classification: 'likely_auth_required',
					raw,
					userFriendly: 'Connection failed. Your local MongoDB instance may require authentication. Please provide a username and password.'
				};
			} else {
				return {
					classification: 'likely_auth_required',
					raw,
					userFriendly: 'Connection failed. This database server likely requires authentication. Please provide a username and password.'
				};
			}
		}
	}

	// 🔍 Fallback
	logger.warn('Unclassified database error - providing raw error:', { raw, lower, code, engine });
	return { classification: 'unknown', raw, userFriendly: `Database connection failed: ${raw}` };
}
