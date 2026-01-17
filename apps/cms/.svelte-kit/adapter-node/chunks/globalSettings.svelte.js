import 'clsx';
import './schemas.js';
import './logger.js';
const state = {};
function getPublicSetting(key) {
	return state[key];
}
const publicEnv = state;
export { getPublicSetting, publicEnv };
//# sourceMappingURL=globalSettings.svelte.js.map
