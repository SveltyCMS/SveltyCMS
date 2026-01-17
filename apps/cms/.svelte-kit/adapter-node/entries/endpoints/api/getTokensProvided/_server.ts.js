import { getPrivateSettingSync } from '../../../../chunks/settingsService.js';
import { json } from '@sveltejs/kit';
import { l as logger } from '../../../../chunks/logger.server.js';
const GET = async () => {
	logger.debug('Checking provided tokens...');
	const tokensProvided = {
		google: Boolean(getPrivateSettingSync('GOOGLE_API_KEY')),
		twitch: Boolean(getPrivateSettingSync('TWITCH_TOKEN')),
		tiktok: Boolean(getPrivateSettingSync('TIKTOK_TOKEN'))
	};
	Object.entries(tokensProvided).forEach(([service, isProvided]) => {
		logger.debug(`${service} token is ${isProvided ? 'provided' : 'not provided'}.`);
	});
	logger.info('Tokens provided status', tokensProvided);
	return json(tokensProvided);
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
