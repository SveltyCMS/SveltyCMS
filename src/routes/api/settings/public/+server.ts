/**
 * @file src/routes/api/settings/public/+server.ts
 * @description API endpoint to get all public settings.
 * This is used by the client to fetch updated settings when the version changes.
 */

import { json } from '@sveltejs/kit';
import { dbAdapter } from '@src/databases/db';
import { settingsGroups } from '@src/routes/(app)/config/systemsetting/settingsGroups';
import { defaultPublicSettings } from '@src/routes/setup/seed';

export const GET = async () => {
	const publicSettings: Record<string, any> = {};
	const publicFields = settingsGroups.flatMap((g) => g.fields).filter((f) => f.category === 'public');

	const keys = publicFields.map((f) => f.key);

	// Start with default values
	for (const key of keys) {
		const found = defaultPublicSettings.find((s) => s.key === key);
		if (found) {
			publicSettings[key] = found.value;
		}
	}

	const dbValues = await dbAdapter.systemPreferences.getMany(keys);

	if (dbValues.success && dbValues.data) {
		for (const key of keys) {
			if (dbValues.data[key] !== undefined) {
				if (dbValues.data[key] !== null && typeof dbValues.data[key] === 'object' && 'value' in dbValues.data[key]) {
					publicSettings[key] = dbValues.data[key].value;
				} else {
					publicSettings[key] = dbValues.data[key];
				}
			}
		}
	}

	return json(publicSettings);
};
