import { dev } from '$app/environment';
import { getPrivateSetting } from '@src/services/settingsService';
import pkg from '../../package.json';

// In-memory cache for update checks (prevent spamming the server)
let cachedUpdateInfo: any = null;
let lastCheckTime = 0;
const CHECK_INTERVAL = 1000 * 60 * 60 * 12; // Check every 12 hours

export const telemetryService = {
	/**
	 * Checks for security updates and sends system health telemetry.
	 * This is the "Drupal Model": You give data to get security status.
	 */
	async checkUpdateStatus() {
		// 1. Check Opt-out Settings (Unified via settingsService)
		// This handles both Environment Variables and Database Settings
		const telemetryDisabled = await getPrivateSetting('SVELTY_TELEMETRY_DISABLED');
		const doNotTrack = await getPrivateSetting('DO_NOT_TRACK');

		if (telemetryDisabled || doNotTrack) {
			return { status: 'disabled', latest: null, security_issue: false };
		}

		// TEMPORARY: Disable telemetry until endpoint is live to prevent console spam
		return { status: 'disabled', latest: null, security_issue: false };

		// 3. Return Cache if valid
		const now = Date.now();
		if (cachedUpdateInfo && now - lastCheckTime < CHECK_INTERVAL) {
			return cachedUpdateInfo;
		}

		// 4. Gather Data (The Payload)
		const payload = {
			current_version: pkg.version,
			node_version: process.version,
			environment: dev ? 'development' : 'production',
			os: process.platform,
			license: 'BSL-1.1'
		};

		try {
			// 5. Exchange Data for Security Status
			// Replace with your actual endpoint: https://telemetry.sveltycms.com/api/check-update
			const response = await fetch('https://telemetry.sveltycms.com/api/check-update', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!response.ok) throw new Error('Update server unreachable');

			const data = await response.json();

			// Cache the result
			cachedUpdateInfo = {
				status: 'active',
				latest: data.latest_version, // e.g. "0.6.0"
				security_issue: data.has_vulnerability, // Boolean: is current version unsafe?
				message: data.message // e.g. "Critical security update available"
			};
			lastCheckTime = now;

			return cachedUpdateInfo;
		} catch (err) {
			console.error('[Telemetry] Security check failed:', err);
			// Update lastCheckTime to prevent immediate retries on failure
			// This ensures we don't spam the server or slow down the app if the endpoint is down
			lastCheckTime = Date.now();

			// Fail safe: assume no connection but don't crash
			return { status: 'error', latest: pkg.version, security_issue: false };
		}
	}
};
