/*
 * @files api/telemetry/report/+server.ts
 * @description Telemetry Report
 *
 * ### Features
 * - Admin/Guest Access
 * - Forward to telemetry.sveltycms.com
 *
 * ### Security
 * - Fail silently - telemetry should never break the app
 */
import { json } from '@sveltejs/kit';
import { getPrivateSetting } from '@src/services/settingsService';
import type { RequestEvent } from './$types';

export async function POST({ request }: RequestEvent) {
	const telemetryDisabled = await getPrivateSetting('SVELTY_TELEMETRY_DISABLED');

	if (telemetryDisabled) {
		return json({ status: 'disabled' }, { status: 200 });
	}

	try {
		const data = await request.json();

		// Forward to telemetry.sveltycms.com when it exists
		const response = await fetch('https://telemetry.sveltycms.com/api/collect', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});

		if (!response.ok) {
			throw new Error('Telemetry server unreachable');
		}

		const result = await response.json();
		return json(result);
	} catch (err) {
		// Fail silently - telemetry should never break the app
		return json({ status: 'error' }, { status: 200 });
	}
}
