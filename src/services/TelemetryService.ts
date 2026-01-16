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
 */
import { getPrivateSetting } from '@src/services/settingsService';
import pkg from '../../package.json';

// In-memory cache for update checks
// let cachedUpdateInfo: any = null;
// let lastCheckTime = 0;
// const CHECK_INTERVAL = 1000 * 60 * 60 * 12; // 12 hours

export const telemetryService = {
	async checkUpdateStatus() {
		// Check opt-out settings
		const telemetryDisabled = await getPrivateSetting('SVELTY_TELEMETRY_DISABLED');
		const doNotTrack = await getPrivateSetting('DO_NOT_TRACK');

		if (telemetryDisabled || doNotTrack) {
			return { status: 'disabled', latest: null, security_issue: false };
		}

		// ✅ Keep disabled until endpoint is ready
		return {
			status: 'disabled',
			latest: pkg.version,
			security_issue: false,
			message: 'Telemetry endpoint not yet available'
		};

		/* Uncomment when telemetry.sveltycms.com is live:
		
		const now = Date.now();
		if (cachedUpdateInfo && now - lastCheckTime < CHECK_INTERVAL) {
			return cachedUpdateInfo;
		}

		const payload = {
			current_version: pkg.version,
			node_version: process.version,
			environment: dev ? 'development' : 'production',
			os: process.platform,
			license: 'BSL-1.1'
		};

		try {
			const response = await fetch('https://telemetry.sveltycms.com/api/check-update', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!response.ok) throw new Error('Update server unreachable');

			const data = await response.json();

			cachedUpdateInfo = {
				status: 'active',
				latest: data.latest_version,
				security_issue: data.has_vulnerability,
				message: data.message
			};
			lastCheckTime = now;

			return cachedUpdateInfo;
		} catch (err) {
			console.error('[Telemetry] Security check failed:', err);
			lastCheckTime = Date.now();
			return { status: 'error', latest: pkg.version, security_issue: false };
		}
		*/
	}
};
