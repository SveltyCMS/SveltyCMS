import { D as DEFAULT_SYSTEM_READY_TIMEOUT, g as getSystemState, s as systemState, S as SERVICE_BASELINE_TIMES } from './state.js';
import { C, a, M, q, t, y, v, p, z, i, b, m, l, k, j, h, f, o, r, n, e, d, c, w, x, u, A } from './state.js';
import { logger } from './logger.js';
import { g, a as a2, b as b2, i as i2 } from './reporting.js';
const SERVICE_NAMES = ['database', 'auth', 'cache', 'contentManager', 'themeManager', 'widgets'];
async function waitForSystemReady(options = {}) {
	const { timeoutMs = DEFAULT_SYSTEM_READY_TIMEOUT, signal } = options;
	if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
	let currentState = getSystemState();
	if (currentState.overallState === 'READY' || currentState.overallState === 'DEGRADED') {
		return true;
	}
	if (currentState.overallState === 'FAILED') {
		return false;
	}
	return new Promise((resolve, reject) => {
		let timeoutId;
		const cleanup = () => {
			clearTimeout(timeoutId);
			unsubscribe();
			signal?.removeEventListener('abort', onAbort);
		};
		const onAbort = () => {
			cleanup();
			reject(new DOMException('Aborted', 'AbortError'));
		};
		const unsubscribe = systemState.subscribe((state) => {
			if (state.overallState === 'READY' || state.overallState === 'DEGRADED') {
				cleanup();
				resolve(true);
			} else if (state.overallState === 'FAILED') {
				cleanup();
				resolve(false);
			}
		});
		signal?.addEventListener('abort', onAbort, { once: true });
		if (timeoutMs > 0) {
			timeoutId = setTimeout(() => {
				cleanup();
				currentState = getSystemState();
				logger.warn(`System ready timeout after ${timeoutMs}ms`, { state: currentState.overallState });
				resolve(false);
			}, timeoutMs);
		}
	});
}
function getServiceTimeout(serviceName, multiplier = 3) {
	const state = getSystemState();
	const service = state.services[serviceName];
	const baseline = SERVICE_BASELINE_TIMES[serviceName];
	if (service.metrics.averageInitTime) {
		const calculated = Math.max(service.metrics.averageInitTime * multiplier, (service.metrics.maxInitTime ?? baseline) * 1.5);
		return Math.min(calculated, 3e4);
	}
	return baseline * multiplier;
}
async function waitForServiceHealthy(serviceName, options = {}) {
	const { timeoutMs, signal } = options;
	const effectiveTimeout = timeoutMs ?? getServiceTimeout(serviceName);
	if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
	let currentState = getSystemState();
	if (currentState.services[serviceName].status === 'healthy') {
		return true;
	}
	if (currentState.services[serviceName].status === 'unhealthy') {
		return false;
	}
	return new Promise((resolve, reject) => {
		let timeoutId;
		const cleanup = () => {
			clearTimeout(timeoutId);
			unsubscribe();
			signal?.removeEventListener('abort', onAbort);
		};
		const onAbort = () => {
			cleanup();
			reject(new DOMException('Aborted', 'AbortError'));
		};
		const unsubscribe = systemState.subscribe((state) => {
			const service = state.services[serviceName];
			if (service.status === 'healthy') {
				cleanup();
				resolve(true);
			} else if (service.status === 'unhealthy') {
				cleanup();
				resolve(false);
			}
		});
		signal?.addEventListener('abort', onAbort, { once: true });
		if (effectiveTimeout > 0) {
			timeoutId = setTimeout(() => {
				cleanup();
				currentState = getSystemState();
				logger.warn(`Service ${serviceName} healthy timeout after ${effectiveTimeout}ms`, {
					status: currentState.services[serviceName].status
				});
				resolve(false);
			}, effectiveTimeout);
		}
	});
}
export {
	C as CALIBRATION_CHECK_INTERVAL,
	a as DEFAULT_ANOMALY_THRESHOLDS,
	DEFAULT_SYSTEM_READY_TIMEOUT,
	M as MAX_STATE_TRANSITIONS_TO_KEEP,
	SERVICE_BASELINE_TIMES,
	SERVICE_NAMES,
	q as authStatus,
	t as cacheStatus,
	y as calibrateAnomalyThresholds,
	v as contentManagerStatus,
	p as databaseStatus,
	z as detectAnomalies,
	g as getHealthCheckReport,
	a2 as getPerformanceSummary,
	b2 as getRecommendedTimeouts,
	getServiceTimeout,
	getSystemState,
	i2 as identifyBottlenecks,
	i as initialServiceMetrics,
	b as initialState,
	m as isDegraded,
	l as isFailed,
	k as isInitializing,
	j as isReady,
	h as isServiceHealthy,
	f as isSystemReady,
	o as overallState,
	r as resetSystemState,
	n as servicesStatus,
	e as setSystemState,
	d as startServiceInitialization,
	systemState,
	c as systemStateStore,
	w as themeManagerStatus,
	x as trackStateTransition,
	u as updateServiceHealth,
	A as updateUptimeMetrics,
	waitForServiceHealthy,
	waitForSystemReady
};
//# sourceMappingURL=index8.js.map
