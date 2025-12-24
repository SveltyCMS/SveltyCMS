/*
 * @files services/TelemetryService.ts
 * @description Telemetry Service
 *
 * ### Features
 * - Update Checks
 * - Admin/Guest Access
 * - Forward to telemetry.sveltycms.com
 *
 * ### Security
 * - Fail silently - telemetry should never break the app
 * - Uses Hashed Secret for Unique ID (Never sends raw secret)
 */
import { building, dev } from '$app/environment';
import { getPrivateSetting } from '@src/services/settingsService';
import pkg from '../../package.json';
import { createHash } from 'node:crypto';
import os from 'node:os'; // Added for server metrics
import { getWidgetsByType } from '@src/widgets/proxy';
import { logger } from '@utils/logger';

// In-memory cache for update checks, backed by globalThis to survive HMR in dev
const globalWithCache = globalThis as typeof globalThis & {
	__SVELTY_TELEMETRY_CACHE__?: any;
	__SVELTY_TELEMETRY_LAST_CHECK__?: number;
};

let cachedUpdateInfo: any = globalWithCache.__SVELTY_TELEMETRY_CACHE__ || null;
let lastCheckTime = globalWithCache.__SVELTY_TELEMETRY_LAST_CHECK__ || 0;
const CHECK_INTERVAL = 1000 * 60 * 60 * 12; // 12 hours
let activeCheckPromise: Promise<any> | null = null; // Deduping promise

export const telemetryService = {
	async checkUpdateStatus() {
		// Disable telemetry in test mode (CI/CD) or during build
		if (typeof process !== 'undefined' && (process.env.TEST_MODE === 'true' || process.env.VITEST)) {
			return { status: 'test_mode', latest: null, security_issue: false };
		}

		if (building) {
			return { status: 'building', latest: null, security_issue: false };
		}

		// Check opt-out settings
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

		// Return existing promise if a check is already running (deduplication)
		if (activeCheckPromise) {
			logger.debug('[Telemetry] Reusing active check promise');
			return activeCheckPromise;
		}

		logger.info('📡 Starting Telemetry check (Background)...');

		// Start the check in a truly non-blocking way
		activeCheckPromise = (async () => {
			try {
				// 1. Calculate Installation ID (Specific to this config/secret)
				const jwtSecret = (await getPrivateSetting('JWT_SECRET_KEY')) || 'fallback_secret';
				const installationId = createHash('sha256').update(jwtSecret).digest('hex');

				// 2. Calculate Stable Machine ID (Survives fresh installs/config deletion)
				// We hash hardware traits that are stable for a given environment
				const stableTraits = `${os.type()}-${os.arch()}-${os.totalmem()}-${os.cpus().length}-${os.cpus()[0]?.model || 'unknown'}`;
				const stableId = createHash('sha256').update(stableTraits).digest('hex');

				// Real widget detection (Custom Only)
				let widgets: string[] = [];
				try {
					widgets = getWidgetsByType('custom');
				} catch (err) {
					logger.debug('[Telemetry] Failed to collect widget info:', err);
				}

				const dbType = await getPrivateSetting('DB_TYPE');

				// Collect geolocation data
				let location = {
					country: undefined as string | undefined,
					country_code: undefined as string | undefined,
					region: undefined as string | undefined,
					city: undefined as string | undefined,
					latitude: undefined as number | undefined,
					longitude: undefined as number | undefined,
					isp: undefined as string | undefined,
					org: undefined as string | undefined
				};

				try {
					const geoRes = await fetch('http://ip-api.com/json/?fields=status,country,countryCode,region,regionName,city,lat,lon,isp,org', {
						headers: { 'User-Agent': `SveltyCMS/${pkg.version}` },
						signal: AbortSignal.timeout(5000)
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

				// Metrics
				let userCount = 0;
				let collectionCount = 0;
				let roleCount = 0;

				try {
					const { dbAdapter } = await import('@src/databases/db');
					if (dbAdapter && dbAdapter.auth) {
						const userCountResult = await dbAdapter.auth.getUserCount();
						if (userCountResult.success) userCount = userCountResult.data;
						roleCount = (await dbAdapter.auth.getAllRoles()).length;
					}

					const { ContentManager } = await import('@src/content/ContentManager');
					const collections = await ContentManager.getInstance().getCollections();
					collectionCount = collections.length;
				} catch (err) {
					logger.debug('[Telemetry] Metrics collection failed:', err);
				}

				// System Info
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

				// 3. Generate HMAC Signature (Identifies this request as an authentic SveltyCMS instance)
				const TELEMETRY_SALT = 'sveltycms-telemetry';
				const cryptoSignature = (await import('node:crypto'))
					.createHmac('sha256', TELEMETRY_SALT)
					.update(`${installationId}:${pkg.version}:${timestamp}`)
					.digest('hex');

				const payload = {
					current_version: pkg.version, // ✅ Required
					node_version: process.version, // ✅ Required
					environment, // ✅ Required
					os: os.type(), // ✅ Required
					installation_id: installationId, // ✅ Required for auth
					timestamp, // ✅ Required for auth
					signature: cryptoSignature, // ✅ Required for auth
					is_ephemeral: environment === 'development' || environment === 'test', // Optional
					stable_id: stableId, // Optional
					db_type: dbType, // Optional
					location: Object.values(location).some((v) => v !== undefined) ? location : undefined, // Optional
					usage_metrics: { users: userCount, collections: collectionCount, roles: roleCount }, // Optional
					system_info: systemInfo, // Optional
					widgets // Optional
				};

				const telemetryEndpoint = process.env.TELEMETRY_ENDPOINT || 'https://telemetry.sveltycms.com/api/check-update';
				const response = await fetch(telemetryEndpoint, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'User-Agent': 'SveltyCMS-Telemetry/1.0'
					},
					body: JSON.stringify(payload),
					signal: AbortSignal.timeout(10000)
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
