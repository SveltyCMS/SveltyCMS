import { r as replaceTokens } from './engine.js';
import { logger } from './logger.js';
async function processTokensInResponse(data, user, locale, context = {}) {
	if (!data) return data;
	const maxDepth = context.maxDepth || 10;
	const currentDepth = context.currentDepth || 0;
	if (currentDepth > maxDepth) return data;
	if (Array.isArray(data)) {
		return Promise.all(data.map((item) => processTokensInResponse(item, user, locale, { ...context, currentDepth: currentDepth + 1 })));
	}
	if (typeof data === 'object' && data !== null) {
		if (data instanceof Date) return data;
		const result = {};
		for (const [key, value] of Object.entries(data)) {
			result[key] = await processTokensInResponse(value, user, locale, { ...context, currentDepth: currentDepth + 1 });
		}
		return result;
	}
	if (typeof data === 'string' && data.includes('{{')) {
		if (data.includes('\\{{')) return data.replace(/\\\{\{/g, '{{').replace(/\\\}\}/g, '}}');
		try {
			const fullContext = {
				user,
				locale,
				system: context.system || { now: /* @__PURE__ */ new Date().toISOString() }
			};
			return await replaceTokens(data, fullContext);
		} catch (error) {
			logger.warn('Token resolution failed', { error, token: data });
			return data;
		}
	}
	return data;
}
export { processTokensInResponse as p };
//# sourceMappingURL=helper.js.map
