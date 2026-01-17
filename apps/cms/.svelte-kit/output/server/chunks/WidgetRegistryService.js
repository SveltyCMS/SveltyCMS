import { logger } from './logger.js';
class WidgetRegistryService {
	static instance;
	widgets = /* @__PURE__ */ new Map();
	isInitialized = false;
	constructor() {
		logger.debug('WidgetRegistryService instance created.');
	}
	static getInstance() {
		if (!WidgetRegistryService.instance) {
			WidgetRegistryService.instance = new WidgetRegistryService();
		}
		return WidgetRegistryService.instance;
	}
	/**
	 * Registers a single widget manually.
	 */
	registerWidget(name, widgetFn) {
		this.widgets.set(name, widgetFn);
		logger.trace(`[WidgetRegistryService] Registered widget: ${name}`);
	}
	/**
	 * Registers multiple widgets at once.
	 */
	registerWidgets(widgets) {
		for (const [name, widgetFn] of Object.entries(widgets)) {
			this.registerWidget(name, widgetFn);
		}
		this.isInitialized = true;
	}
	getWidget(name) {
		return this.widgets.get(name);
	}
	getAllWidgets() {
		return this.widgets;
	}
	/**
	 * Processes a raw widget module into a standard factory (internal use)
	 */
	processWidgetModule(path, module, type) {
		try {
			const name = path.split('/').at(-2);
			if (!name) return null;
			if (typeof module.default !== 'function') return null;
			const originalFn = module.default;
			const widgetName = originalFn.Name || name;
			const dependencies = originalFn.__dependencies || [];
			const widgetFn = Object.assign((config) => originalFn(config), {
				Name: widgetName,
				GuiSchema: originalFn.GuiSchema,
				GraphqlSchema: originalFn.GraphqlSchema,
				Icon: originalFn.Icon,
				Description: originalFn.Description,
				aggregations: originalFn.aggregations,
				__widgetType: type,
				__dependencies: dependencies,
				__inputComponentPath: originalFn.__inputComponentPath || '',
				__displayComponentPath: originalFn.__displayComponentPath || '',
				componentPath: originalFn.__inputComponentPath || ''
			});
			return {
				name: widgetFn.Name,
				widgetFn,
				dependencies,
				folderName: name
			};
		} catch (error) {
			logger.error(`Failed to process widget module ${path}:`, error);
			return null;
		}
	}
}
const widgetRegistryService = WidgetRegistryService.getInstance();
export { widgetRegistryService };
//# sourceMappingURL=WidgetRegistryService.js.map
