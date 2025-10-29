/**
 * @file src/routes/api/system/restart-required/+server.ts
 * @description API endpoint to check if a server restart is required.
 */

import { json } from '@sveltejs/kit';
import { isRestartNeeded } from '@src/utils/server/restartRequired';

export const GET = async () => {
	return json({ restartNeeded: isRestartNeeded() });
};
