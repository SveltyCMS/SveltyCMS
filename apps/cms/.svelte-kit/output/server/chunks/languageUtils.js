import { logger } from './logger.js';
function getLanguageName(tag, displayLocale) {
	if (!tag || tag.trim() === '') {
		return tag;
	}
	try {
		const locale = displayLocale || tag;
		if (!locale || locale.trim() === '') {
			return tag;
		}
		const languageNames = new Intl.DisplayNames([locale], { type: 'language' });
		return languageNames.of(tag) || tag;
	} catch (error) {
		logger.warn(`Error getting language name for ${tag}:`, error);
		return tag;
	}
}
export { getLanguageName as g };
//# sourceMappingURL=languageUtils.js.map
