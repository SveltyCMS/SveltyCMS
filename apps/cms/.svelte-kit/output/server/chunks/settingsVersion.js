import { l as logger } from './logger.server.js';
let currentVersion = 0;
const listeners = /* @__PURE__ */ new Set();
function updateVersion() {
	currentVersion++;
	listeners.forEach((listener) => {
		try {
			listener(currentVersion);
		} catch (error) {
			logger.error('Error notifying settings listener:', error);
		}
	});
}
function subscribeToSettingsChanges(listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
export { subscribeToSettingsChanges as s, updateVersion as u };
//# sourceMappingURL=settingsVersion.js.map
