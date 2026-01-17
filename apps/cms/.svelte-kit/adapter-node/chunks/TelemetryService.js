import { dev } from './index3.js';
import { c as getPrivateEnv } from './db.js';
import { getPrivateSetting } from './settingsService.js';
import pkg from './package.js';
import { createHash } from 'node:crypto';
import { logger } from './logger.js';
import os from 'node:os';
import { b as building } from './environment.js';
const globalWithCache = globalThis;
let cachedUpdateInfo = globalWithCache.__SVELTY_TELEMETRY_CACHE__ || null;
let lastCheckTime = globalWithCache.__SVELTY_TELEMETRY_LAST_CHECK__ || 0;
const CHECK_INTERVAL = 1e3 * 60 * 60 * 12;
let activeCheckPromise = null;
const telemetryService = {
	async checkUpdateStatus() {
		if (typeof process !== 'undefined' && (process.env.TEST_MODE === 'true' || process.env.VITEST)) {
			return { status: 'test_mode', latest: null, security_issue: false };
		}
		if (building) {
			return { status: 'building', latest: null, security_issue: false };
		}
		let isTelemetryEnabled = true;
		try {
			const setting = await getPrivateSetting('SVELTYCMS_TELEMETRY');
			isTelemetryEnabled = setting !== false;
		} catch (err) {
			logger.debug('[Telemetry] Could not check opt-out setting, defaulting to enabled', err);
		}
		if (!isTelemetryEnabled) {
			logger.info('📡 Telemetry is disabled by configuration.');
			return { status: 'disabled', latest: null, security_issue: false };
		}
		const now = Date.now();
		if (cachedUpdateInfo && now - lastCheckTime < CHECK_INTERVAL && !dev) {
			return cachedUpdateInfo;
		}
		if (activeCheckPromise) {
			logger.debug('[Telemetry] Reusing active check promise');
			return activeCheckPromise;
		}
		logger.info('📡 Starting Telemetry check (Background)...');
		activeCheckPromise = (async () => {
			try {
				const jwtSecret = (await getPrivateSetting('JWT_SECRET_KEY')) || 'fallback_secret';
				const installationId = createHash('sha256').update(jwtSecret).digest('hex');
				const stableTraits = `${os.type()}-${os.arch()}-${os.totalmem()}-${os.cpus().length}-${os.cpus()[0]?.model || 'unknown'}`;
				const stableId = createHash('sha256').update(stableTraits).digest('hex');
				let widgets = [];
				try {
					const { widgetRegistryService } = await import('./WidgetRegistryService.js');
					widgets = widgetRegistryService.getAllWidgets().size > 0 ? Array.from(widgetRegistryService.getAllWidgets().keys()) : [];
				} catch (err) {
					logger.debug('[Telemetry] Failed to collect widget info:', err);
				}
				const privateEnv = getPrivateEnv();
				const dbType = privateEnv?.DB_TYPE || (await getPrivateSetting('DB_TYPE')) || 'unknown';
				let location = {
					country: void 0,
					country_code: void 0,
					region: void 0,
					city: void 0,
					latitude: void 0,
					longitude: void 0,
					isp: void 0,
					org: void 0
				};
				try {
					const geoRes = await fetch('http://ip-api.com/json/?fields=status,country,countryCode,region,regionName,city,lat,lon,isp,org', {
						headers: { 'User-Agent': `SveltyCMS/${pkg.version}` },
						signal: AbortSignal.timeout(5e3)
					});
					if (geoRes.ok) {
						const geoData = await geoRes.json();
						if (geoData.status === 'success') {
							location = {
								country: geoData.country,
								country_code: geoData.countryCode,
								region: geoData.regionName || geoData.region,
								city: geoData.city,
								latitude: geoData.lat,
								longitude: geoData.lon,
								isp: geoData.isp,
								org: geoData.org
							};
						}
					}
				} catch (e) {
					logger.debug('[Telemetry] Could not resolve location:', e);
				}
				let userCount = 0;
				let collectionCount = 0;
				let roleCount = 0;
				try {
					const { dbAdapter } = await import('./db.js').then((n) => n.e);
					if (dbAdapter && dbAdapter.auth) {
						const userCountResult = await dbAdapter.auth.getUserCount();
						if (userCountResult.success) userCount = userCountResult.data;
						roleCount = (await dbAdapter.auth.getAllRoles()).length;
					}
					const { configService } = await import('./ConfigService.js');
					const contentManager = configService.getContentManager();
					if (contentManager) {
						const collections = await contentManager.getCollections();
						collectionCount = collections.length;
					}
				} catch (err) {
					logger.debug('[Telemetry] Metrics collection failed:', err);
				}
				const cpus = os.cpus();
				const systemInfo = {
					cpu_count: cpus.length,
					cpu_model: cpus.length > 0 ? cpus[0].model : 'unknown',
					total_memory_gb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
					os_type: os.type(),
					os_release: os.release(),
					os_arch: os.arch()
				};
				const environment = process.env.NODE_ENV || (dev ? 'development' : 'production');
				const timestamp = Date.now();
				const TELEMETRY_SALT = 'sveltycms-telemetry';
				const cryptoSignature = (await import('node:crypto'))
					.createHmac('sha256', TELEMETRY_SALT)
					.update(`${installationId}:${pkg.version}:${timestamp}`)
					.digest('hex');
				const payload = {
					current_version: pkg.version,
					// ✅ Required
					node_version: process.version,
					// ✅ Required
					environment,
					// ✅ Required
					os: os.type(),
					// ✅ Required
					installation_id: installationId,
					// ✅ Required for auth
					timestamp,
					// ✅ Required for auth
					signature: cryptoSignature,
					// ✅ Required for auth
					is_ephemeral: environment === 'development' || environment === 'test',
					// Optional
					stable_id: stableId,
					// Optional
					db_type: dbType,
					// Optional
					location: Object.values(location).some((v) => v !== void 0) ? location : void 0,
					// Optional
					usage_metrics: { users: userCount, collections: collectionCount, roles: roleCount },
					// Optional
					system_info: systemInfo,
					// Optional
					widgets
					// Optional
				};
				const telemetryEndpoint = process.env.TELEMETRY_ENDPOINT || 'https://telemetry.sveltycms.com/api/check-update';
				const response = await fetch(telemetryEndpoint, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'User-Agent': 'SveltyCMS-Telemetry/1.0'
					},
					body: JSON.stringify(payload),
					signal: AbortSignal.timeout(1e4)
				});
				if (response.status === 429) {
					cachedUpdateInfo = { status: 'rate_limited', latest: pkg.version, security_issue: false };
				} else if (!response.ok) {
					throw new Error(`Update server unreachable: ${response.status}`);
				} else {
					const data = await response.json();
					cachedUpdateInfo = {
						status: 'active',
						latest: data.latest_version,
						security_issue: data.has_vulnerability,
						message: data.message,
						telemetry_id: data.telemetry_id
					};
				}
				lastCheckTime = Date.now();
				globalWithCache.__SVELTY_TELEMETRY_CACHE__ = cachedUpdateInfo;
				globalWithCache.__SVELTY_TELEMETRY_LAST_CHECK__ = lastCheckTime;
				return cachedUpdateInfo;
			} catch (err) {
				logger.warn('[Telemetry] Check failed:', err instanceof Error ? err.message : String(err));
				lastCheckTime = Date.now();
				cachedUpdateInfo = { status: 'error', latest: pkg.version, security_issue: false };
				globalWithCache.__SVELTY_TELEMETRY_CACHE__ = cachedUpdateInfo;
				globalWithCache.__SVELTY_TELEMETRY_LAST_CHECK__ = lastCheckTime;
				return cachedUpdateInfo;
			} finally {
				activeCheckPromise = null;
			}
		})();
		return activeCheckPromise;
	}
};
export { telemetryService };
//# sourceMappingURL=TelemetryService.js.map
