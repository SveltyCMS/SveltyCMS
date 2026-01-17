import { widgetRegistryService } from './WidgetRegistryService.js';
import { logger } from './logger.js';
function generateCategoryNodesFromPaths(files) {
	const folders = /* @__PURE__ */ new Map();
	for (const file of files) {
		if (!file.path) continue;
		const parts = file.path.split('/').filter(Boolean);
		let path = '';
		for (let i = 0; i < parts.length - 1; i++) {
			const name = parts[i];
			path = `${path}/${name}`;
			if (!folders.has(path)) {
				folders.set(path, { name, path, nodeType: 'category' });
			}
		}
	}
	return folders;
}
async function processModule(content) {
	try {
		const exportMatch = content.match(/export\s+const\s+schema\s*=\s*/);
		if (!exportMatch) {
			logger.warn('No schema export found in module');
			return null;
		}
		const startIdx = exportMatch.index + exportMatch[0].length;
		let braceCount = 0;
		let inString = false;
		let stringChar = '';
		let endIdx = startIdx;
		for (let i = startIdx; i < content.length; i++) {
			const char = content[i];
			const prevChar = i > 0 ? content[i - 1] : '';
			if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
				if (!inString) {
					inString = true;
					stringChar = char;
				} else if (char === stringChar) {
					inString = false;
					stringChar = '';
				}
			}
			if (!inString) {
				if (char === '{') braceCount++;
				if (char === '}') braceCount--;
				if (braceCount === 0 && char === '}') {
					endIdx = i + 1;
					break;
				}
			}
		}
		const schemaContent = content.substring(startIdx, endIdx);
		if (!schemaContent || schemaContent.trim() === '') {
			logger.warn('Could not extract schema content');
			return null;
		}
		const widgetsMap = widgetRegistryService.getAllWidgets();
		if (widgetsMap.size === 0) {
			logger.warn('WidgetRegistryService not initialized yet. Cannot process module.');
			return null;
		}
		const widgetsObject = Object.fromEntries(widgetsMap.entries());
		const moduleContent = `
			return (function() {
				const widgets = globalThis.widgets;
				const schema = ${schemaContent};
				return schema;
			})();
		`;
		if (typeof globalThis !== 'undefined') {
			globalThis.widgets = widgetsObject;
		}
		const moduleFunc = new Function(moduleContent);
		const result = moduleFunc();
		if (typeof globalThis !== 'undefined') {
			delete globalThis.widgets;
		}
		if (result && typeof result === 'object' && 'fields' in result && '_id' in result) {
			logger.trace(`Processed collection: ${result._id}`);
			return { schema: result };
		}
		logger.warn(`Module processed but no fields or _id found. Result type: ${typeof result}`);
		return null;
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Failed to process module:', { error: errorMessage, stack: err instanceof Error ? err.stack : void 0 });
		return null;
	}
}
export { generateCategoryNodesFromPaths, processModule };
//# sourceMappingURL=utils4.js.map
