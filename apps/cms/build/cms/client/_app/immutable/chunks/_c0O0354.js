import { d as l, w as S, g as x } from './DvgRl2rN.js';
import { l as u } from './BvngfGKt.js';
const C = { maxStartupTime: 5e3, maxShutdownTime: 2e3, maxConsecutiveFailures: 3, minUptimePercentage: 95, calibrationCount: 0 },
	g = {
		healthCheckCount: 0,
		failureCount: 0,
		restartCount: 0,
		consecutiveFailures: 0,
		uptimePercentage: 100,
		stateTimings: {
			startup: { count: 0, trend: 'unknown' },
			shutdown: { count: 0, trend: 'unknown' },
			idle: { count: 0, totalTime: 0 },
			active: { count: 0, totalTime: 0 }
		},
		anomalyThresholds: { ...C }
	},
	I = {
		overallState: 'IDLE',
		services: {
			database: { status: 'initializing', message: 'Not initialized', metrics: structuredClone(g) },
			auth: { status: 'initializing', message: 'Not initialized', metrics: structuredClone(g) },
			cache: { status: 'initializing', message: 'Not initialized', metrics: structuredClone(g) },
			contentManager: { status: 'initializing', message: 'Not initialized', metrics: structuredClone(g) },
			themeManager: { status: 'initializing', message: 'Not initialized', metrics: structuredClone(g) },
			widgets: { status: 'initializing', message: 'Not initialized', metrics: structuredClone(g) }
		},
		performanceMetrics: { totalInitializations: 0, successfulInitializations: 0, failedInitializations: 0, stateTransitions: [] }
	};
function y(t, c, o, e, i) {
	i.update((a) => {
		const n = { ...a.services[t] },
			s = { ...n.metrics.stateTimings };
		{
			const r = { ...s.startup };
			if ((r.count++, (r.lastTime = e), !r.avgTime)) ((r.avgTime = e), (r.minTime = e), (r.maxTime = e));
			else {
				const d = r.avgTime;
				((r.avgTime = (r.avgTime * (r.count - 1) + e) / r.count),
					(r.minTime = Math.min(r.minTime ?? e, e)),
					(r.maxTime = Math.max(r.maxTime ?? e, e)),
					e < d * 0.9 ? (r.trend = 'improving') : e > d * 1.1 ? (r.trend = 'degrading') : (r.trend = 'stable'));
			}
			s.startup = r;
		}
		return ((n.metrics.stateTimings = s), { ...a, services: { ...a.services, [t]: n } });
	});
}
function z(t, c) {
	c.update((o) => {
		const e = { ...o.services[t] },
			i = e.metrics,
			a = { ...i.anomalyThresholds };
		if (i.stateTimings.startup.count < 5)
			return (u.debug(`Skipping calibration for ${String(t)} - insufficient data (${i.stateTimings.startup.count} startups)`), o);
		if (i.stateTimings.startup.avgTime && i.stateTimings.startup.maxTime) {
			const s = i.stateTimings.startup.avgTime * 3,
				r = i.stateTimings.startup.maxTime * 1.5;
			a.maxStartupTime = Math.max(s, r);
		}
		if (i.stateTimings.shutdown.avgTime && i.stateTimings.shutdown.maxTime) {
			const s = i.stateTimings.shutdown.avgTime * 3,
				r = i.stateTimings.shutdown.maxTime * 1.5;
			a.maxShutdownTime = Math.max(s, r);
		}
		i.uptimePercentage > 99
			? (a.maxConsecutiveFailures = 2)
			: i.uptimePercentage > 95
				? (a.maxConsecutiveFailures = 3)
				: (a.maxConsecutiveFailures = 5);
		const n = i.uptimePercentage;
		return (
			n > 99 ? (a.minUptimePercentage = 98) : n > 95 ? (a.minUptimePercentage = 90) : (a.minUptimePercentage = 80),
			(a.lastCalibrated = Date.now()),
			a.calibrationCount++,
			(e.metrics.anomalyThresholds = a),
			u.info(`🎯 Calibrated anomaly thresholds for ${String(t)}`, {
				maxStartup: `${a.maxStartupTime.toFixed(0)}ms`,
				maxShutdown: `${a.maxShutdownTime.toFixed(0)}ms`,
				maxFailures: a.maxConsecutiveFailures,
				minUptime: `${a.minUptimePercentage}%`,
				calibrationCount: a.calibrationCount
			}),
			{ ...o, services: { ...o.services, [t]: e } }
		);
	});
}
function F(t, c) {
	const e = c.services[t].metrics,
		i = e.anomalyThresholds,
		a = [];
	if (e.stateTimings.startup.lastTime && e.stateTimings.startup.lastTime > i.maxStartupTime) {
		const n = (e.stateTimings.startup.lastTime / i.maxStartupTime - 1) * 100;
		a.push({
			type: 'slow_startup',
			severity: n > 100 ? 'critical' : n > 50 ? 'high' : 'medium',
			message: `Service ${String(t)} startup is slower than expected`,
			details: {
				actual: `${e.stateTimings.startup.lastTime.toFixed(0)}ms`,
				threshold: `${i.maxStartupTime.toFixed(0)}ms`,
				excess: `${n.toFixed(0)}%`
			}
		});
	}
	return (
		e.stateTimings.shutdown.lastTime &&
			e.stateTimings.shutdown.lastTime > i.maxShutdownTime &&
			a.push({
				type: 'slow_shutdown',
				severity: 'medium',
				message: `Service ${String(t)} shutdown is slower than expected`,
				details: { actual: `${e.stateTimings.shutdown.lastTime.toFixed(0)}ms`, threshold: `${i.maxShutdownTime.toFixed(0)}ms` }
			}),
		e.consecutiveFailures >= i.maxConsecutiveFailures &&
			a.push({
				type: 'consecutive_failures',
				severity: e.consecutiveFailures >= i.maxConsecutiveFailures * 2 ? 'critical' : 'high',
				message: `Service ${String(t)} has ${e.consecutiveFailures} consecutive failures`,
				details: { failures: e.consecutiveFailures, threshold: i.maxConsecutiveFailures.toString() }
			}),
		e.uptimePercentage < i.minUptimePercentage &&
			a.push({
				type: 'low_uptime',
				severity: e.uptimePercentage < i.minUptimePercentage * 0.8 ? 'high' : 'medium',
				message: `Service ${String(t)} uptime is below threshold`,
				details: { uptime: `${e.uptimePercentage.toFixed(1)}%`, threshold: `${i.minUptimePercentage}%` }
			}),
		e.stateTimings.startup.trend === 'degrading' &&
			e.stateTimings.startup.count > 10 &&
			a.push({
				type: 'degrading_performance',
				severity: 'medium',
				message: `Service ${String(t)} performance is degrading over time`,
				details: {
					trend: e.stateTimings.startup.trend,
					avgTime: `${e.stateTimings.startup.avgTime?.toFixed(0)}ms`,
					lastTime: `${e.stateTimings.startup.lastTime?.toFixed(0)}ms`
				}
			}),
		a.length > 0 &&
			a.forEach((n) => {
				n.severity === 'critical' || n.severity === 'high' ? u.error(`🚨 ${n.message}`, n.details) : u.warn(`⚠️ ${n.message}`, n.details);
			}),
		a
	);
}
function $(t, c) {
	c.update((o) => {
		const e = { ...o.services[t] },
			i = e.metrics;
		if (i.healthCheckCount > 0) {
			const a = i.healthCheckCount - i.failureCount;
			i.uptimePercentage = (a / i.healthCheckCount) * 100;
		}
		return ((e.metrics = i), { ...o, services: { ...o.services, [t]: e } });
	});
}
const h = S(I);
function w(t, c, o, e, i) {
	const a = Date.now(),
		n = t.services[c],
		s = { ...n.metrics };
	if (o === 'healthy' && n.status === 'initializing' && s.initializationStartedAt) {
		const m = a - s.initializationStartedAt;
		((s.initializationCompletedAt = a), (s.initializationDuration = m));
		const v = 2 / (s.healthCheckCount + 1);
		(s.averageInitTime
			? ((s.averageInitTime = v * m + (1 - v) * s.averageInitTime),
				(s.minInitTime = Math.min(s.minInitTime ?? m, m)),
				(s.maxInitTime = Math.max(s.maxInitTime ?? m, m)))
			: ((s.averageInitTime = m), (s.minInitTime = m), (s.maxInitTime = m)),
			u.info(`✓ Service ${c} initialized in ${m}ms`, { average: s.averageInitTime.toFixed(2), min: s.minInitTime, max: s.maxInitTime }),
			(s.consecutiveFailures = 0));
	}
	(o === 'unhealthy' &&
		(s.consecutiveFailures++,
		s.failureCount++,
		n.status !== 'unhealthy' &&
			((s.lastFailureAt = a),
			u.warn(`Service ${c} became unhealthy (failure #${s.failureCount}, consecutive: ${s.consecutiveFailures})`, { error: i }))),
		o === 'healthy' && n.status === 'unhealthy' && (u.info(`✓ Service ${c} recovered from failure`), (s.consecutiveFailures = 0)),
		s.healthCheckCount++,
		(s.lastHealthCheckAt = a));
	const r = {
			...t,
			services: { ...t.services, [c]: { status: o, message: e, lastChecked: a, ...(i && { error: i }), metrics: s } },
			lastStateChange: a
		},
		d = A(r.services);
	if (((r.overallState = d), d === 'READY' && t.overallState === 'INITIALIZING' && t.performanceMetrics.totalInitializations > 0)) {
		const m = t.initializationStartedAt ? a - t.initializationStartedAt : 0;
		((r.performanceMetrics = {
			...t.performanceMetrics,
			successfulInitializations: t.performanceMetrics.successfulInitializations + 1,
			lastInitDuration: m
		}),
			u.info(`✓ System auto-transitioned to READY (initialization completed in ${m}ms)`));
	}
	return r;
}
function b(t, c, o, e) {
	(h.update((s) => w(s, t, c, o, e)), $(t, h));
	const i = f().services[t];
	if (c === 'healthy' && i.metrics.initializationDuration) {
		const s = i.metrics.initializationDuration;
		y(t, 'initializing', 'healthy', s, h);
	}
	const a = i.metrics;
	a.healthCheckCount > 0 && a.healthCheckCount % 10 === 0 && z(t, h);
	const n = F(t, f());
	n.length > 0 &&
		n.some((s) => s.severity === 'critical' || s.severity === 'high') &&
		u.error(`🚨 ${n.length} anomal${n.length > 1 ? 'ies' : 'y'} detected for ${t}`);
}
function A(t) {
	const c = ['database', 'auth'],
		o = ['cache', 'contentManager', 'themeManager'];
	return c.some((n) => t[n].status === 'unhealthy')
		? 'FAILED'
		: c.some((n) => t[n].status === 'initializing')
			? 'INITIALIZING'
			: o.some((n) => t[n].status === 'unhealthy')
				? 'DEGRADED'
				: 'READY';
}
function f() {
	return x(h);
}
const D = l(h, (t) => t),
	p = l(h, (t) => t.overallState);
l(p, (t) => t === 'READY' || t === 'DEGRADED');
l(p, (t) => t === 'INITIALIZING');
l(p, (t) => t === 'FAILED');
l(p, (t) => t === 'DEGRADED');
const T = l(D, (t) => t.services);
l(T, (t) => t.database);
l(T, (t) => t.auth);
l(T, (t) => t.cache);
l(T, (t) => t.contentManager);
l(T, (t) => t.themeManager);
export { D as s, b as u };
//# sourceMappingURL=_c0O0354.js.map
