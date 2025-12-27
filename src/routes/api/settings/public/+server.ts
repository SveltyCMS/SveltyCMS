/**
 * @file src/routes/api/settings/public/+server.ts
 * @description API endpoint to get all public settings.
 * This is used by the client to fetch updated settings when the version changes.
 */

import { json } from '@sveltejs/kit';
import { dbAdapter } from '@src/databases/db';
import { settingsGroups } from '@src/routes/(app)/config/systemsetting/settingsGroups';
import { defaultPublicSettings } from '@src/routes/api/setup/seed';

export const GET = async () => {
	// 1. Get list of public keys from our definitions
	// Use a Set for faster lookup if we had many keys, but array is fine here
	const publicKeys = settingsGroups
		.flatMap((g) => g.fields)
		.filter((f) => f.category === 'public')
		.map((f) => f.key);

	// 2. Initialize with defaults (fast in-memory operation)
	// We create a base object with all default values appropriately typed
	const publicSettings: Record<string, unknown> = {};

	// Create a map of defaults for O(1) access during merge if needed,
	// but mostly we just populate the initial state.
	for (const setting of defaultPublicSettings) {
		if (publicKeys.includes(setting.key)) {
			publicSettings[setting.key] = setting.value;
		}
	}

	// 3. If DB is available, fetch overrides in a single batch query
	if (dbAdapter?.systemPreferences) {
		try {
			const dbResult = await dbAdapter.systemPreferences.getMany(publicKeys);

			if (dbResult.success && dbResult.data) {
				for (const key of publicKeys) {
					const dbEntry = dbResult.data[key];
					if (dbEntry !== undefined) {
						// Handle wrapped values (legacy or metadata-rich format) vs raw values
						// SveltyCMS sometimes stores settings as { value: ..., category: ... }
						const val = dbEntry !== null && typeof dbEntry === 'object' && 'value' in dbEntry ? (dbEntry as { value: unknown }).value : dbEntry;

						// Debug logging for languages
						if (key === 'AVAILABLE_CONTENT_LANGUAGES') {
							console.log('[SettingsAPI] Found languages in DB:', val);
						}

						// Type safety check for arrays (like languages) to ensure we don't return malformed data
						if (key === 'AVAILABLE_CONTENT_LANGUAGES' || key === 'LOCALES') {
							if (Array.isArray(val)) {
								publicSettings[key] = val;
							} else {
								console.warn(`[SettingsAPI] Expected array for ${key} but got:`, typeof val);
							}
						} else {
							publicSettings[key] = val;
						}
					}
				}
			}
		} catch (error) {
			// Fail gracefully - user gets defaults if DB fails
			console.error('[SettingsAPI] Failed to fetch overrides:', error);
		}
	}

	// 4. Return JSON response
	// setting cache-control to ensure freshness while avoiding hammering
	return json(publicSettings, {
		headers: {
			'Cache-Control': 'public, max-age=30' // Cache for 30s
		}
	});
};
