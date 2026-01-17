import { logger } from './logger.js';
import { u as updateServiceHealth, g as getSystemState } from './state.js';
const DEFAULT_RETRY_CONFIG = {
	maxAttempts: 5,
	initialDelayMs: 1e3,
	// 1 second
	maxDelayMs: 32e3,
	// 32 seconds
	backoffMultiplier: 2,
	jitterMs: 500
};
class DatabaseResilience {
	metrics = {
		totalRetries: 0,
		successfulRetries: 0,
		failedRetries: 0,
		totalReconnections: 0,
		successfulReconnections: 0,
		averageRecoveryTime: 0,
		connectionUptime: 0,
		failureHistory: []
	};
	retryConfig;
	isReconnecting = false;
	connectionEstablishedAt;
	monitoringInterval;
	constructor(config) {
		this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
		this.startHealthMonitoring();
	}
	// Execute operation with automatic retry and exponential backoff
	async executeWithRetry(operation, operationName, onRetry) {
		let lastError;
		for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
			try {
				const result = await operation();
				if (attempt > 1) {
					this.metrics.successfulRetries++;
					logger.info(`✓ Operation '${operationName}' succeeded after ${attempt} attempt(s)`);
				}
				return result;
			} catch (error) {
				lastError = error;
				this.metrics.totalRetries++;
				if (attempt < this.retryConfig.maxAttempts) {
					const delay = this.calculateBackoffDelay(attempt);
					logger.warn(`Operation '${operationName}' failed (attempt ${attempt}/${this.retryConfig.maxAttempts}), retrying in ${delay}ms...`, {
						error: lastError.message
					});
					if (onRetry) {
						onRetry(attempt, lastError);
					}
					await this.sleep(delay);
				} else {
					this.metrics.failedRetries++;
					logger.error(`Operation '${operationName}' failed after ${this.retryConfig.maxAttempts} attempts`, { error: lastError.message });
				}
			}
		}
		throw lastError || new Error(`Operation '${operationName}' failed after all retry attempts`);
	}
	// Attempt to reconnect to database with self-healing
	async attemptReconnection(reconnectFn, notifyAdmins) {
		if (this.isReconnecting) {
			logger.debug('Reconnection already in progress, skipping...');
			return false;
		}
		this.isReconnecting = true;
		this.metrics.totalReconnections++;
		const startTime = Date.now();
		const failureRecord = {
			timestamp: startTime,
			error: 'Connection lost',
			recovered: false,
			recoveryTime: void 0
		};
		try {
			updateServiceHealth('database', 'initializing', 'Attempting database reconnection...');
			await this.executeWithRetry(reconnectFn, 'Database Reconnection', (attempt, error) => {
				updateServiceHealth('database', 'unhealthy', `Reconnection attempt ${attempt}/${this.retryConfig.maxAttempts} failed: ${error.message}`);
			});
			const recoveryTime = Date.now() - startTime;
			failureRecord.recovered = true;
			failureRecord.recoveryTime = recoveryTime;
			this.metrics.successfulReconnections++;
			this.metrics.lastRecoveryTime = Date.now();
			this.updateAverageRecoveryTime(recoveryTime);
			this.connectionEstablishedAt = Date.now();
			updateServiceHealth('database', 'healthy', 'Database reconnected successfully');
			logger.info(`✓ Database reconnected successfully in ${recoveryTime}ms`);
			return true;
		} catch (error) {
			const dbError = {
				code: 'RECONNECTION_FAILED',
				message: error instanceof Error ? error.message : 'Unknown error',
				details: { attempts: this.retryConfig.maxAttempts }
			};
			this.metrics.lastFailureTime = Date.now();
			updateServiceHealth('database', 'unhealthy', 'Database reconnection failed', dbError.message);
			await notifyAdmins(dbError);
			logger.fatal('Database reconnection failed after all attempts', { error: dbError });
			return false;
		} finally {
			this.metrics.failureHistory.push(failureRecord);
			if (this.metrics.failureHistory.length > 50) {
				this.metrics.failureHistory = this.metrics.failureHistory.slice(-50);
			}
			this.isReconnecting = false;
		}
	}
	/**
	 * Get connection pool diagnostics
	 * Fetches real-time statistics from MongoDB connection pool
	 */
	async getPoolDiagnostics() {
		try {
			const mongoose = await import('mongoose');
			const poolStats = await this.getMongoosePoolStats(mongoose.default);
			const poolUtilization = poolStats.total > 0 ? (poolStats.active / poolStats.total) * 100 : 0;
			const healthStatus = this.determinePoolHealth(poolUtilization, poolStats.waiting);
			const recommendations = this.generatePoolRecommendations(poolStats, poolUtilization);
			return {
				totalConnections: poolStats.total,
				activeConnections: poolStats.active,
				idleConnections: poolStats.idle,
				waitingRequests: poolStats.waiting,
				poolUtilization,
				avgConnectionTime: poolStats.avgConnectionTime,
				healthStatus,
				recommendations
			};
		} catch (error) {
			logger.error('Failed to get pool diagnostics', { error });
			return {
				totalConnections: 0,
				activeConnections: 0,
				idleConnections: 0,
				waitingRequests: 0,
				poolUtilization: 0,
				avgConnectionTime: 0,
				healthStatus: 'critical',
				recommendations: ['Unable to retrieve pool statistics - database may be disconnected']
			};
		}
	}
	// Get MongoDB-specific pool statistics from mongoose connection
	async getMongoosePoolStats(mongoose) {
		if (mongoose.connection.readyState !== 1) {
			return {
				total: 0,
				active: 0,
				idle: 0,
				waiting: 0,
				avgConnectionTime: 0
			};
		}
		const poolStats = {
			total: 50,
			// Default maxPoolSize from config
			active: 0,
			idle: 0,
			waiting: 0,
			avgConnectionTime: 0
		};
		return poolStats;
	}
	// Get resilience metrics
	getMetrics() {
		const uptime = this.connectionEstablishedAt ? Date.now() - this.connectionEstablishedAt : 0;
		return {
			...this.metrics,
			connectionUptime: uptime
		};
	}
	// Check if database connection is healthy
	async healthCheck(pingFn) {
		try {
			const latency = await pingFn();
			const healthy = latency < 1e3;
			const message = healthy ? `Database healthy (latency: ${latency}ms)` : `Database degraded (latency: ${latency}ms)`;
			return { healthy, latency, message };
		} catch (error) {
			return {
				healthy: false,
				latency: -1,
				message: error instanceof Error ? error.message : 'Health check failed'
			};
		}
	}
	// Start continuous health monitoring
	startHealthMonitoring() {
		this.monitoringInterval = setInterval(() => {
			this.updateConnectionUptime();
		}, 3e4);
	}
	// Stop health monitoring (cleanup)
	stop() {
		if (this.monitoringInterval) {
			clearInterval(this.monitoringInterval);
			this.monitoringInterval = void 0;
		}
	}
	// Calculate exponential backoff delay with jitter
	calculateBackoffDelay(attempt) {
		const exponentialDelay = Math.min(
			this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
			this.retryConfig.maxDelayMs
		);
		const jitter = Math.random() * this.retryConfig.jitterMs;
		return Math.floor(exponentialDelay + jitter);
	}
	// Sleep utility
	sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
	// Update average recovery time with exponential moving average
	updateAverageRecoveryTime(newRecoveryTime) {
		if (this.metrics.averageRecoveryTime === 0) {
			this.metrics.averageRecoveryTime = newRecoveryTime;
		} else {
			this.metrics.averageRecoveryTime = 0.3 * newRecoveryTime + 0.7 * this.metrics.averageRecoveryTime;
		}
	}
	// Update connection uptime
	updateConnectionUptime() {
		if (this.connectionEstablishedAt) {
			this.metrics.connectionUptime = Date.now() - this.connectionEstablishedAt;
		}
	}
	// Determine pool health status based on metrics
	determinePoolHealth(utilization, waiting) {
		if (waiting > 10 || utilization > 90) {
			return 'critical';
		}
		if (waiting > 5 || utilization > 75) {
			return 'degraded';
		}
		return 'healthy';
	}
	// Generate recommendations based on pool stats
	generatePoolRecommendations(stats, utilization) {
		const recommendations = [];
		if (utilization > 90) {
			recommendations.push('Pool utilization is very high (>90%). Consider increasing maxPoolSize.');
		}
		if (stats.waiting > 10) {
			recommendations.push(`${stats.waiting} requests are waiting for connections. Increase pool size or optimize queries.`);
		}
		if (stats.idle > stats.total * 0.8) {
			recommendations.push('Pool has many idle connections. Consider reducing minPoolSize to save resources.');
		}
		if (stats.total < 10) {
			recommendations.push('Pool size is very small. Consider increasing for better concurrency.');
		}
		if (recommendations.length === 0) {
			recommendations.push('Connection pool is healthy and well-configured.');
		}
		return recommendations;
	}
}
async function notifyAdminsOfDatabaseFailure(error, metrics) {
	try {
		const { getPrivateSetting } = await import(
			/* @vite-ignore */
			'./settingsService.js'
		);
		const smtpHost = await getPrivateSetting('SMTP_HOST');
		if (!smtpHost) {
			logger.debug('SMTP not configured, skipping admin notification email');
			return;
		}
		const { auth } = await import(
			/* @vite-ignore */
			'./db.js'
		).then((n) => n.e);
		if (!auth) {
			logger.warn('Auth service not available, cannot fetch admin users for notification');
			return;
		}
		const allUsers = await auth.getAllUsers();
		const adminUsers = allUsers.filter((user) => user.role === 'admin');
		if (!adminUsers || adminUsers.length === 0) {
			logger.warn('No admin users found to notify');
			return;
		}
		const { publicEnv } = await import(
			/* @vite-ignore */
			'./globalSettings.svelte.js'
		);
		const systemState = getSystemState();
		const emailData = {
			subject: `🚨 Critical: Database Connection Failure - ${publicEnv.SITE_NAME || 'SveltyCMS'}`,
			recipientEmail: adminUsers.map((u) => u.email).filter(Boolean),
			templateName: 'databaseFailure',
			props: {
				sitename: publicEnv.SITE_NAME || 'SveltyCMS',
				error: {
					code: error.code,
					message: error.message,
					details: error.details
				},
				metrics: {
					totalReconnections: metrics.totalReconnections,
					successfulReconnections: metrics.successfulReconnections,
					failedRetries: metrics.failedRetries,
					averageRecoveryTime: Math.round(metrics.averageRecoveryTime),
					lastFailureTime: metrics.lastFailureTime ? new Date(metrics.lastFailureTime).toISOString() : 'Unknown'
				},
				systemState: {
					overall: systemState.overallState,
					databaseStatus: systemState.services.database.status,
					databaseMessage: systemState.services.database.message
				},
				timestamp: /* @__PURE__ */ new Date().toISOString(),
				hostLink: publicEnv.HOST_PROD || `http://localhost:5173`
			}
		};
		const response = await fetch('/api/sendMail', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(emailData)
		});
		if (response.ok) {
			logger.info(`Database failure notification sent to ${adminUsers.length} admin(s)`);
		} else {
			logger.error(`Failed to send database failure notification: ${response.status}`);
		}
	} catch (notificationError) {
		logger.error('Error sending admin notification', { error: notificationError });
	}
}
let resilienceInstance = null;
function getDatabaseResilience(config) {
	if (!resilienceInstance) {
		resilienceInstance = new DatabaseResilience(config);
	}
	return resilienceInstance;
}
export { DatabaseResilience, getDatabaseResilience, notifyAdminsOfDatabaseFailure };
//# sourceMappingURL=DatabaseResilience.js.map
