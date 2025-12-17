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
		// Disable telemetry in test mode (CI/CD)
		if (process.env.TEST_MODE === 'true') {
			return { status: 'test_mode', latest: null, security_issue: false };
		}

		// Check opt-out settings
		// Default to TRUE (enabled) if not set or if set to true. Only fully disable if explicitly set to false.
		const isTelemetryEnabled = (await getPrivateSetting('SVELTYCMS_TELEMETRY')) !== false;

		if (!isTelemetryEnabled) {
			return { status: 'disabled', latest: null, security_issue: false };
		}

		const now = Date.now();
		if (cachedUpdateInfo && now - lastCheckTime < CHECK_INTERVAL) {
			return cachedUpdateInfo;
		}

		// Return existing promise if a check is already running (deduplication)
		if (activeCheckPromise) {
			logger.debug('[Telemetry] Reusing active check promise');
			return activeCheckPromise;
		}

		logger.debug('[Telemetry] checkUpdateStatus called (Not Cached)');

		// Calculate Unique ID securely
		const jwtSecret = (await getPrivateSetting('JWT_SECRET_KEY')) || 'fallback_secret';
		const installationId = createHash('sha256').update(jwtSecret).digest('hex');

		// Real widget detection (Custom Only)
		const widgets = getWidgetsByType('custom');

		// Features detection (Disabled for now as per requirement)
		// const features: string[] = [];

		const dbType = await getPrivateSetting('DB_TYPE');

		// Collect detailed geolocation data for clustering detection and BSL enforcement
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
				signal: AbortSignal.timeout(3000) // 3 second timeout
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
					logger.info(`[Telemetry] Location resolved: ${location.city}, ${location.region}, ${location.country}`);
				}
			}
		} catch (e) {
			logger.debug('[Telemetry] Could not resolve detailed location:', e);
		}

		// Usage Metrics (BSL 1.1 Enforcement Support)
		let userCount = 0;
		let collectionCount = 0;
		let roleCount = 0;

		try {
			// Lazy load DB adapter and ContentManager to avoid circular deps
			const { dbAdapter } = await import('@src/databases/db');

			if (dbAdapter && dbAdapter.auth) {
				// Get User Count
				const userCountResult = await dbAdapter.auth.getUserCount();
				if (userCountResult.success) {
					userCount = userCountResult.data;
				}

				// Get Role Count (proxy for complexity)
				roleCount = (await dbAdapter.auth.getAllRoles()).length;
			}

			// Get Collection Count from ContentManager
			const { ContentManager } = await import('@src/content/ContentManager');
			const collections = await ContentManager.getInstance().getCollections();
			collectionCount = collections.length;
		} catch (err) {
			logger.debug('[Telemetry] Failed to collect detailed metrics:', err);
			// Fail silently for metrics, don't crash the telemetry check
		}

		// Gather hardware metrics securely
		const cpus = os.cpus();
		const systemInfo = {
			cpu_count: cpus.length,
			cpu_model: cpus.length > 0 ? cpus[0].model : 'unknown',
			total_memory_gb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
			free_memory_gb: Math.round(os.freemem() / 1024 / 1024 / 1024),
			os_type: os.type(),
			os_release: os.release(),
			os_arch: os.arch()
		};

		const payload = {
			current_version: pkg.version,
			node_version: process.version,
			environment: process.env.NODE_ENV || 'production',
			installation_id: installationId,
			db_type: dbType,
			location, // Detailed geolocation data
			// Usage Metrics
			metrics: {
				users: userCount,
				collections: collectionCount,
				roles: roleCount
			},
			// Hardware Metrics
			system: systemInfo,
			widgets: JSON.stringify(widgets)
			// features: JSON.stringify(features) // TODO: Add features
		};

		// Start the check and assign to promise variable
		activeCheckPromise = (async () => {
			try {
				logger.debug(`[Telemetry] Sending heartbeat sveltycms.com`);
				logger.debug(`[Telemetry] Payload:`, payload);

				const response = await fetch('https://telemetry.sveltycms.com/api/check-update', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				});

				if (response.status === 429) {
					logger.warn('[Telemetry] Rate limit exceeded (429). Skipping check for 12 hours.');
					cachedUpdateInfo = { status: 'rate_limited', latest: pkg.version, security_issue: false };
					lastCheckTime = now;
					// Update global for HMR persistence
					globalWithCache.__SVELTY_TELEMETRY_CACHE__ = cachedUpdateInfo;
					globalWithCache.__SVELTY_TELEMETRY_LAST_CHECK__ = lastCheckTime;
					return cachedUpdateInfo;
				}

				if (!response.ok) throw new Error(`Update server unreachable: ${response.status}`);

				const data = await response.json();
				logger.debug(`[Telemetry] Response:`, data);

				cachedUpdateInfo = {
					status: 'active',
					latest: data.latest_version,
					security_issue: data.has_vulnerability,
					message: data.message,
					telemetry_id: data.telemetry_id
				};
				lastCheckTime = now;

				// Update global for HMR persistence
				globalWithCache.__SVELTY_TELEMETRY_CACHE__ = cachedUpdateInfo;
				globalWithCache.__SVELTY_TELEMETRY_LAST_CHECK__ = lastCheckTime;

				return cachedUpdateInfo;
			} catch (err) {
				logger.error('[Telemetry] Security check failed:', err);

				// Cache the error state to prevent retrying immediately (respect 12h interval even on error)
				lastCheckTime = Date.now();
				cachedUpdateInfo = { status: 'error', latest: pkg.version, security_issue: false };

				// Update global for HMR persistence
				globalWithCache.__SVELTY_TELEMETRY_CACHE__ = cachedUpdateInfo;
				globalWithCache.__SVELTY_TELEMETRY_LAST_CHECK__ = lastCheckTime;

				return cachedUpdateInfo;
			} finally {
				// Clear the promise so next scheduled check can run
				activeCheckPromise = null;
			}
		})();

		return activeCheckPromise;
	}
};
