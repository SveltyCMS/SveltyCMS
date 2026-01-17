import 'clsx';
import { logger } from './logger.js';
import { c as coreModules, a as customModules } from './scanner.js';
class WidgetState {
	widgets = {};
	widgetFunctions = {};
	coreWidgets = [];
	customWidgets = [];
	marketplaceWidgets = [];
	activeWidgets = [];
	dependencyMap = {};
	tenantId = 'default';
	isLoaded = false;
	loading = false;
	healthStatus = 'initializing';
	lastHealthCheck = void 0;
	constructor() {}
	async initialize(tenantId = 'default', dbAdapter) {
		if (this.loading) {
			logger.debug('[WidgetStore] Initialization already in progress, skipping.');
			return;
		}
		if (this.isLoaded && this.tenantId === tenantId && !dbAdapter) {
			logger.debug('[WidgetStore] Widgets already loaded, skipping initialization.');
			return;
		}
		this.loading = true;
		this.tenantId = tenantId;
		logger.info(`[WidgetStore] Initializing for tenant: ${tenantId}`);
		try {
			const newWidgetFunctions = {};
			const newCoreWidgets = [];
			const newCustomWidgets = [];
			const newDependencyMap = {};
			for (const [path, module] of Object.entries(coreModules)) {
				const name = path.split('/').at(-2);
				if (!name || typeof module.default !== 'function') continue;
				const fn = module.default;
				const widgetName = fn.Name || name;
				fn.Name = widgetName;
				fn.__widgetType = 'core';
				newWidgetFunctions[widgetName] = fn;
				newCoreWidgets.push(widgetName);
				if (fn.__dependencies && fn.__dependencies.length > 0) {
					newDependencyMap[widgetName] = fn.__dependencies;
				}
				if (name && name !== widgetName) {
					newWidgetFunctions[name] = fn;
				}
			}
			for (const [path, module] of Object.entries(customModules)) {
				const name = path.split('/').at(-2);
				if (!name || typeof module.default !== 'function') continue;
				const fn = module.default;
				const widgetName = fn.Name || name;
				fn.Name = widgetName;
				fn.__widgetType = 'custom';
				newWidgetFunctions[widgetName] = fn;
				newCustomWidgets.push(widgetName);
				if (fn.__dependencies && fn.__dependencies.length > 0) {
					newDependencyMap[widgetName] = fn.__dependencies;
				}
				if (name && name !== widgetName) {
					newWidgetFunctions[name] = fn;
				}
			}
			this.widgetFunctions = newWidgetFunctions;
			this.coreWidgets = newCoreWidgets;
			this.customWidgets = newCustomWidgets;
			this.dependencyMap = newDependencyMap;
			let activeWidgetNames = [];
			if (dbAdapter) {
				const activeRes = await dbAdapter.widgets.getActiveWidgets();
				if (activeRes.success) {
					activeWidgetNames = (activeRes.data ?? []).map((w) => w.name);
				}
			} else if (typeof window !== 'undefined') {
				const res = await fetch(`/api/widgets/active${!this.isLoaded ? '?refresh=true' : ''}`, { headers: { 'X-Tenant-ID': tenantId } });
				if (res.ok) {
					const data = await res.json();
					activeWidgetNames = (data.widgets || []).map((w) => w.name);
				}
			}
			const normalizedActive = activeWidgetNames
				.map((name) => {
					if (this.widgetFunctions[name]) return name;
					const camelCase = name.charAt(0).toLowerCase() + name.slice(1);
					if (this.widgetFunctions[camelCase]) return camelCase;
					const lowerCase = name.toLowerCase();
					if (this.widgetFunctions[lowerCase]) return lowerCase;
					return name;
				})
				.filter((name) => this.widgetFunctions[name]);
			const uniqueActive = [.../* @__PURE__ */ new Set([...normalizedActive, ...newCoreWidgets])];
			this.activeWidgets = uniqueActive;
			const newWidgets = {};
			for (const [name, fn] of Object.entries(this.widgetFunctions)) {
				newWidgets[name] = fn({});
			}
			this.widgets = newWidgets;
			this.isLoaded = true;
			this.loading = false;
			this.healthStatus = 'healthy';
			this.lastHealthCheck = Date.now();
			logger.info(`[WidgetStore] Initialized: ${this.coreWidgets.length} core, ${this.customWidgets.length} custom widgets.`);
		} catch (e) {
			this.loading = false;
			this.healthStatus = 'unhealthy';
			logger.error('[WidgetStore] Initialization failed:', e);
		}
	}
	async updateStatus(name, status, tenantId) {
		const targetTenant = tenantId || this.tenantId;
		const active = status === 'active';
		if (active && isWidgetCore(name)) return;
		if (!active && !canDisableWidget(name)) {
			throw new Error(`Cannot disable widget ${name}: other widgets depend on it`);
		}
		if (active) {
			const deps = getWidgetDependencies(name);
			const inactiveDeps = deps.filter((dep) => !isWidgetActive(dep));
			if (inactiveDeps.length > 0) {
				throw new Error(`Cannot activate widget ${name}: missing dependencies: ${inactiveDeps.join(', ')}`);
			}
		}
		try {
			await this.updateInDatabase(name, active, targetTenant);
			if (active) {
				if (!this.activeWidgets.includes(name)) {
					this.activeWidgets.push(name);
				}
			} else {
				this.activeWidgets = this.activeWidgets.filter((w) => w !== name);
			}
			logger.info(`[WidgetStore] Widget '${name}' status changed to '${status}'`);
		} catch (e) {
			logger.error(`[WidgetStore] Failed to update status for ${name}:`, e);
			throw e;
		}
	}
	async updateConfig(name, config) {
		const currentFn = this.widgetFunctions[name];
		if (!currentFn || typeof currentFn !== 'function') return;
		const updatedFn = Object.assign((cfg) => currentFn({ ...config, ...cfg }), currentFn);
		this.widgetFunctions[name] = updatedFn;
		this.widgets[name] = updatedFn({});
	}
	async reload(tenantId) {
		this.isLoaded = false;
		await this.initialize(tenantId || this.tenantId);
	}
	async updateInDatabase(name, active, tenantId) {
		if (typeof window !== 'undefined') {
			const res = await fetch('/api/widgets/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': tenantId },
				body: JSON.stringify({ widgetName: name, isActive: active })
			});
			if (!res.ok) throw new Error('Database sync failed');
		}
	}
}
const widgets = new WidgetState();
function getWidgetFunction(name) {
	return widgets.widgetFunctions[name];
}
function isWidgetActive(name) {
	return widgets.activeWidgets.includes(name);
}
function isWidgetCore(name) {
	return widgets.coreWidgets.includes(name);
}
function getWidgetDependencies(name) {
	return widgets.dependencyMap[name] || [];
}
function canDisableWidget(name) {
	if (isWidgetCore(name)) return false;
	const dependents = Object.entries(widgets.dependencyMap)
		.filter(([, deps]) => deps.includes(name))
		.map(([n]) => n);
	return !dependents.some(isWidgetActive);
}
({
	updateStatus: widgets.updateStatus.bind(widgets),
	updateConfig: widgets.updateConfig.bind(widgets),
	reload: widgets.reload.bind(widgets),
	initializeWidgets: widgets.initialize.bind(widgets)
});
const widgetFunctions = {
	subscribe(fn) {
		fn(widgets.widgetFunctions);
		return () => {};
	}
};
export { canDisableWidget, getWidgetDependencies, getWidgetFunction, isWidgetActive, isWidgetCore, widgetFunctions, widgets };
//# sourceMappingURL=widgetStore.svelte.js.map
