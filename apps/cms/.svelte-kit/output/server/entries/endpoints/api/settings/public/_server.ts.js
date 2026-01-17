import { json } from '@sveltejs/kit';
import { d as dbAdapter } from '../../../../../chunks/db.js';
import { s as settingsGroups, d as defaultPublicSettings } from '../../../../../chunks/defaults.js';
const GET = async () => {
	const publicKeys = settingsGroups
		.flatMap((g) => g.fields)
		.filter((f) => f.category === 'public')
		.map((f) => f.key);
	const publicSettings = {};
	for (const setting of defaultPublicSettings) {
		if (publicKeys.includes(setting.key)) {
			publicSettings[setting.key] = setting.value;
		}
	}
	if (dbAdapter?.systemPreferences) {
		try {
			const dbResult = await dbAdapter.systemPreferences.getMany(publicKeys);
			if (dbResult.success && dbResult.data) {
				for (const key of publicKeys) {
					const dbEntry = dbResult.data[key];
					if (dbEntry !== void 0) {
						const val = dbEntry !== null && typeof dbEntry === 'object' && 'value' in dbEntry ? dbEntry.value : dbEntry;
						if (key === 'AVAILABLE_CONTENT_LANGUAGES') {
							console.log('[SettingsAPI] Found languages in DB:', val);
						}
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
			console.error('[SettingsAPI] Failed to fetch overrides:', error);
		}
	}
	return json(publicSettings, {
		headers: {
			'Cache-Control': 'public, max-age=30'
			// Cache for 30s
		}
	});
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
