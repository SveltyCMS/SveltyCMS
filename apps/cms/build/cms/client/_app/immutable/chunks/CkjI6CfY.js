import { _ as h } from './PPVm8Dsz.js';
import { l as s } from './BvngfGKt.js';
import { u as c } from './_c0O0354.js';
const f = { maxAttempts: 5, initialDelayMs: 1e3, maxDelayMs: 32e3, backoffMultiplier: 2, jitterMs: 500 };
class g {
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
	isReconnecting = !1;
	connectionEstablishedAt;
	monitoringInterval;
	constructor(t) {
		((this.retryConfig = { ...f, ...t }), this.startHealthMonitoring());
	}
	async executeWithRetry(t, e, i) {
		let o;
		for (let n = 1; n <= this.retryConfig.maxAttempts; n++)
			try {
				const a = await t();
				return (n > 1 && (this.metrics.successfulRetries++, s.info(`✓ Operation '${e}' succeeded after ${n} attempt(s)`)), a);
			} catch (a) {
				if (((o = a), this.metrics.totalRetries++, n < this.retryConfig.maxAttempts)) {
					const r = this.calculateBackoffDelay(n);
					(s.warn(`Operation '${e}' failed (attempt ${n}/${this.retryConfig.maxAttempts}), retrying in ${r}ms...`, { error: o.message }),
						i && i(n, o),
						await this.sleep(r));
				} else
					(this.metrics.failedRetries++, s.error(`Operation '${e}' failed after ${this.retryConfig.maxAttempts} attempts`, { error: o.message }));
			}
		throw o || new Error(`Operation '${e}' failed after all retry attempts`);
	}
	async attemptReconnection(t, e) {
		if (this.isReconnecting) return (s.debug('Reconnection already in progress, skipping...'), !1);
		((this.isReconnecting = !0), this.metrics.totalReconnections++);
		const i = Date.now(),
			o = { timestamp: i, error: 'Connection lost', recovered: !1, recoveryTime: void 0 };
		try {
			(c('database', 'initializing', 'Attempting database reconnection...'),
				await this.executeWithRetry(t, 'Database Reconnection', (a, r) => {
					c('database', 'unhealthy', `Reconnection attempt ${a}/${this.retryConfig.maxAttempts} failed: ${r.message}`);
				}));
			const n = Date.now() - i;
			return (
				(o.recovered = !0),
				(o.recoveryTime = n),
				this.metrics.successfulReconnections++,
				(this.metrics.lastRecoveryTime = Date.now()),
				this.updateAverageRecoveryTime(n),
				(this.connectionEstablishedAt = Date.now()),
				c('database', 'healthy', 'Database reconnected successfully'),
				s.info(`✓ Database reconnected successfully in ${n}ms`),
				!0
			);
		} catch (n) {
			const a = {
				code: 'RECONNECTION_FAILED',
				message: n instanceof Error ? n.message : 'Unknown error',
				details: { attempts: this.retryConfig.maxAttempts }
			};
			return (
				(this.metrics.lastFailureTime = Date.now()),
				c('database', 'unhealthy', 'Database reconnection failed', a.message),
				await e(a),
				s.fatal('Database reconnection failed after all attempts', { error: a }),
				!1
			);
		} finally {
			(this.metrics.failureHistory.push(o),
				this.metrics.failureHistory.length > 50 && (this.metrics.failureHistory = this.metrics.failureHistory.slice(-50)),
				(this.isReconnecting = !1));
		}
	}
	async getPoolDiagnostics() {
		try {
			const t = await h(() => import('mongoose'), [], import.meta.url),
				e = await this.getMongoosePoolStats(t.default),
				i = e.total > 0 ? (e.active / e.total) * 100 : 0,
				o = this.determinePoolHealth(i, e.waiting),
				n = this.generatePoolRecommendations(e, i);
			return {
				totalConnections: e.total,
				activeConnections: e.active,
				idleConnections: e.idle,
				waitingRequests: e.waiting,
				poolUtilization: i,
				avgConnectionTime: e.avgConnectionTime,
				healthStatus: o,
				recommendations: n
			};
		} catch (t) {
			return (
				s.error('Failed to get pool diagnostics', { error: t }),
				{
					totalConnections: 0,
					activeConnections: 0,
					idleConnections: 0,
					waitingRequests: 0,
					poolUtilization: 0,
					avgConnectionTime: 0,
					healthStatus: 'critical',
					recommendations: ['Unable to retrieve pool statistics - database may be disconnected']
				}
			);
		}
	}
	async getMongoosePoolStats(t) {
		return t.connection.readyState !== 1
			? { total: 0, active: 0, idle: 0, waiting: 0, avgConnectionTime: 0 }
			: { total: 50, active: 0, idle: 0, waiting: 0, avgConnectionTime: 0 };
	}
	getMetrics() {
		const t = this.connectionEstablishedAt ? Date.now() - this.connectionEstablishedAt : 0;
		return { ...this.metrics, connectionUptime: t };
	}
	async healthCheck(t) {
		try {
			const e = await t(),
				i = e < 1e3,
				o = i ? `Database healthy (latency: ${e}ms)` : `Database degraded (latency: ${e}ms)`;
			return { healthy: i, latency: e, message: o };
		} catch (e) {
			return { healthy: !1, latency: -1, message: e instanceof Error ? e.message : 'Health check failed' };
		}
	}
	startHealthMonitoring() {
		this.monitoringInterval = setInterval(() => {
			this.updateConnectionUptime();
		}, 3e4);
	}
	stop() {
		this.monitoringInterval && (clearInterval(this.monitoringInterval), (this.monitoringInterval = void 0));
	}
	calculateBackoffDelay(t) {
		const e = Math.min(this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, t - 1), this.retryConfig.maxDelayMs),
			i = Math.random() * this.retryConfig.jitterMs;
		return Math.floor(e + i);
	}
	sleep(t) {
		return new Promise((e) => setTimeout(e, t));
	}
	updateAverageRecoveryTime(t) {
		this.metrics.averageRecoveryTime === 0
			? (this.metrics.averageRecoveryTime = t)
			: (this.metrics.averageRecoveryTime = 0.3 * t + 0.7 * this.metrics.averageRecoveryTime);
	}
	updateConnectionUptime() {
		this.connectionEstablishedAt && (this.metrics.connectionUptime = Date.now() - this.connectionEstablishedAt);
	}
	determinePoolHealth(t, e) {
		return e > 10 || t > 90 ? 'critical' : e > 5 || t > 75 ? 'degraded' : 'healthy';
	}
	generatePoolRecommendations(t, e) {
		const i = [];
		return (
			e > 90 && i.push('Pool utilization is very high (>90%). Consider increasing maxPoolSize.'),
			t.waiting > 10 && i.push(`${t.waiting} requests are waiting for connections. Increase pool size or optimize queries.`),
			t.idle > t.total * 0.8 && i.push('Pool has many idle connections. Consider reducing minPoolSize to save resources.'),
			t.total < 10 && i.push('Pool size is very small. Consider increasing for better concurrency.'),
			i.length === 0 && i.push('Connection pool is healthy and well-configured.'),
			i
		);
	}
}
let l = null;
function p(m) {
	return (l || (l = new g(m)), l);
}
export { g as DatabaseResilience, p as getDatabaseResilience };
//# sourceMappingURL=CkjI6CfY.js.map
