import { a as attr, e as ensure_array_like, b as attr_style, c as stringify, d as escape_html } from '../../../chunks/index5.js';
import { logger } from '../../../chunks/logger.js';
/* empty css                                                    */
/* empty css                                                                */
import '../../../chunks/store.svelte.js';
import '../../../chunks/schemas.js';
import { P as PageTitle } from '../../../chunks/PageTitle.js';
import 'clsx';
const LAYOUT_KEY = 'dashboard.layout.default';
async function fetchLayout() {
	try {
		const res = await fetch(`/api/systemPreferences?key=${LAYOUT_KEY}`);
		if (res.status === 404) {
			logger.info('No saved dashboard layout, using default');
			return null;
		}
		if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
		return await res.json();
	} catch (e) {
		logger.error('Failed to fetch preferences:', e);
		throw e;
	}
}
async function saveLayout(layout) {
	try {
		const res = await fetch('/api/systemPreferences', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ key: LAYOUT_KEY, value: layout })
		});
		if (!res.ok) throw new Error(`Save failed: ${res.statusText}`);
	} catch (e) {
		logger.error('Failed to save preferences:', e);
		throw e;
	}
}
class PreferencesStore {
	preferences = [];
	loading = true;
	error = null;
	async load() {
		this.loading = true;
		this.error = null;
		try {
			const layout = await fetchLayout();
			this.preferences = (layout?.preferences || []).map((w) => ({ ...w, size: w.size?.w && w.size?.h ? w.size : { w: 1, h: 1 } }));
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'Unknown error';
			this.preferences = [];
		} finally {
			this.loading = false;
		}
	}
	async set(preferences2) {
		this.preferences = preferences2;
		await saveLayout({ id: 'default', name: 'Default', preferences: preferences2 });
	}
	async updateWidget(widget) {
		const prefs = [...this.preferences];
		const idx = prefs.findIndex((w) => w.id === widget.id);
		if (idx > -1) prefs[idx] = widget;
		else prefs.push(widget);
		this.preferences = prefs;
		await saveLayout({ id: 'default', name: 'Default', preferences: prefs });
	}
	async updateWidgets(widgets) {
		const ordered = widgets.map((w, i) => ({ ...w, order: i }));
		this.preferences = ordered;
		await saveLayout({ id: 'default', name: 'Default', preferences: ordered });
	}
	async removeWidget(id) {
		const prefs = this.preferences.filter((w) => w.id !== id);
		this.preferences = prefs;
		await saveLayout({ id: 'default', name: 'Default', preferences: prefs });
	}
	// Compatibility aliases
	async loadPreferences() {
		return this.load();
	}
	async setPreferences(prefs) {
		return this.set(prefs);
	}
}
const preferences = new PreferencesStore();
const systemPreferences = preferences;
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { data } = $$props;
		const MAX_COLUMNS = 4;
		const MAX_ROWS = 4;
		let dropdownOpen = false;
		let searchQuery = '';
		let loadedWidgets = /* @__PURE__ */ new Map();
		const widgetObservers = /* @__PURE__ */ new Map();
		const currentPreferences = systemPreferences.preferences || [];
		const availableWidgets = [];
		availableWidgets.filter((name) => name.toLowerCase().includes(searchQuery.toLowerCase()));
		const currentTheme = 'dark';
		function removeWidget(id) {
			systemPreferences.removeWidget(id);
			loadedWidgets.delete(id);
			const observer = widgetObservers.get(id);
			if (observer) {
				observer.disconnect();
				widgetObservers.delete(id);
			}
		}
		function resizeWidget(widgetId, newSize) {
			const item = currentPreferences.find((i) => i.id === widgetId);
			if (item) {
				const updatedSize = {
					w: Math.max(1, Math.min(MAX_COLUMNS, newSize.w)),
					h: Math.max(1, Math.min(MAX_ROWS, newSize.h))
				};
				systemPreferences.updateWidget({ ...item, size: updatedSize });
			}
		}
		$$renderer2.push(
			`<main class="relative overflow-y-auto overflow-x-hidden" style="touch-action: pan-y;"><header class="mb-2 flex items-center justify-between gap-2 border-b border-surface-200 p-2 dark:text-surface-50">`
		);
		PageTitle($$renderer2, {
			name: 'Dashboard',
			icon: 'bi:bar-chart-line',
			showBackButton: true,
			backUrl: '/config'
		});
		$$renderer2.push(`<!----> <div class="flex items-center gap-2">`);
		if (currentPreferences.length > 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<button class="preset-outlined-surface-500 btn-icon" aria-label="Reset all widgets" title="Reset all widgets"><iconify-icon icon="mdi:refresh"></iconify-icon></button>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> <div class="relative">`);
		if (availableWidgets.length > 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<button class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500" aria-haspopup="true"${attr('aria-expanded', dropdownOpen)} aria-label="Add Widget"><iconify-icon icon="mdi:plus" class="mr-2"></iconify-icon> Add Widget</button>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div></div></header> <div class="relative m-0 w-full p-0"><section class="w-full px-1 py-4">`);
		if (currentPreferences.length > 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<div class="responsive-dashboard-grid svelte-x1i5gj" role="grid">`);
			{
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--> <!--[-->`);
			const each_array_1 = ensure_array_like(currentPreferences.sort((a, b) => (a.order || 0) - (b.order || 0)));
			for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
				let item = each_array_1[$$index_1];
				const WidgetComponent = loadedWidgets.get(item.id);
				$$renderer2.push(
					`<div role="button" tabindex="0" class="widget-container group relative select-none overflow-hidden rounded-lg border border-surface-200/80 bg-surface-50 shadow-sm transition-all duration-300 dark:text-surface-50 dark:bg-surface-800"${attr('data-widget-id', item.id)}${attr_style(
						'',
						{
							'grid-column': `span ${stringify(item.size.w)}`,
							'grid-row': `span ${stringify(item.size.h)}`,
							'touch-action': 'manipulation',
							'min-height': `${stringify(item.size.h * 180)}px`
						}
					)}>`
				);
				if (!WidgetComponent) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<div class="widget-skeleton h-full animate-pulse"><div class="mb-2 h-12 rounded-t bg-surface-300 dark:bg-surface-700"></div> <div class="h-full rounded-b bg-surface-200 p-4 dark:bg-surface-800"><div class="mb-3 h-8 rounded bg-surface-300 dark:bg-surface-700"></div> <div class="mb-2 h-6 w-3/4 rounded bg-surface-300 dark:bg-surface-700"></div> <div class="mb-2 h-6 w-1/2 rounded bg-surface-300 dark:bg-surface-700"></div></div></div>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
					if (WidgetComponent === null) {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(
							`<div class="card preset-ghost-error-500 flex h-full flex-col items-center justify-center p-4"><iconify-icon icon="mdi:alert-circle-outline" width="48" class="mb-2 text-error-500"></iconify-icon> <h3 class="h4 mb-2">Widget Load Error</h3> <p class="text-sm">Failed to load: ${escape_html(item.component)}</p> <button class="preset-filled-error-500 btn-sm mt-4">Remove Widget</button></div>`
						);
					} else {
						$$renderer2.push('<!--[!-->');
						$$renderer2.push(`<!---->`);
						WidgetComponent($$renderer2, {
							config: item,
							onRemove: () => removeWidget(item.id),
							onSizeChange: (newSize) => resizeWidget(item.id, newSize),
							theme: currentTheme,
							currentUser: data.pageData?.user
						});
						$$renderer2.push(`<!---->`);
					}
					$$renderer2.push(`<!--]-->`);
				}
				$$renderer2.push(`<!--]--> `);
				{
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--></div>`);
			}
			$$renderer2.push(`<!--]--></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(
				`<div class="mx-auto flex h-[60vh] w-full flex-col items-center justify-center text-center"><div class="flex flex-col items-center px-10 py-12"><iconify-icon icon="mdi:view-dashboard-outline" width="80" class="mb-6 text-tertiary-500 drop-shadow-lg dark:text-primary-500"></iconify-icon> <p class="mb-2 text-2xl font-bold text-tertiary-500 dark:text-primary-500">Your Dashboard is Empty</p> <p class="mb-6 text-base text-surface-600 dark:text-surface-300">Click below to add your first widget and get started.</p> <button class="btn rounded-full bg-tertiary-500 px-6 py-3 text-lg font-semibold text-white shadow-lg dark:bg-primary-500" aria-label="Add first widget"><iconify-icon icon="mdi:plus" width="22" class="mr-2"></iconify-icon> Add Widget</button></div></div>`
			);
		}
		$$renderer2.push(`<!--]--></section></div></main> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]-->`);
	});
}
export { _page as default };
//# sourceMappingURL=_page.svelte.js.map
