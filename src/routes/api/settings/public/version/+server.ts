/**
 * @file src/routes/api/settings/public/version/+server.ts
 * @description API endpoint to get the current version of the public settings.
 * This is used by the client to poll for changes.
 */

import { json } from '@sveltejs/kit';
import { getVersion } from '@src/utils/server/settingsVersion';

export const GET = async () => {
	return json({ version: getVersion() });
};
