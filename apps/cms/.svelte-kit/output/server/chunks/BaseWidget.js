import { a as attr, c as stringify, g as attr_class, i as clsx, d as escape_html, e as ensure_array_like, b as attr_style } from './index5.js';
import { logger } from './logger.js';
function BaseWidget($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const {
			label = 'Widget',
			theme = 'light',
			icon = void 0,
			endpoint = void 0,
			pollInterval = 0,
			widgetId = void 0,
			children = void 0,
			size = { w: 1, h: 1 },
			onSizeChange = (_newSize) => {},
			resizable = true,
			onCloseRequest = () => {},
			initialData: passedInitialData = void 0,
			onDataLoaded = (_fetchedData) => {},
			// Enhanced features (all optional)
			showRefreshButton = false,
			cacheKey = void 0,
			cacheTTL = 3e5,
			retryCount = 3,
			retryDelay = 1e3
		} = $$props;
		let widgetState = {};
		let loading = false;
		let error = null;
		let internalData = void 0;
		let lastFetchTime = 0;
		let currentRetry = 0;
		function getCachedData() {
			if (!cacheKey || typeof window === 'undefined') return null;
			try {
				const cached = localStorage.getItem(`widget_cache_${cacheKey}`);
				if (!cached) return null;
				const { data, timestamp } = JSON.parse(cached);
				if (Date.now() - timestamp > cacheTTL) {
					localStorage.removeItem(`widget_cache_${cacheKey}`);
					return null;
				}
				return data;
			} catch {
				return null;
			}
		}
		function setCachedData(data) {
			if (!cacheKey || typeof window === 'undefined') return;
			try {
				localStorage.setItem(`widget_cache_${cacheKey}`, JSON.stringify({ data, timestamp: Date.now() }));
			} catch (err) {
				logger.warn(`Failed to cache widget data for ${label}:`, err);
			}
		}
		async function fetchData(retryAttempt = 0) {
			if (!endpoint) {
				loading = false;
				return;
			}
			if (retryAttempt === 0) {
				const cached = getCachedData();
				if (cached) {
					internalData = cached;
					onDataLoaded(cached);
					loading = false;
					return;
				}
			}
			loading = true;
			error = null;
			currentRetry = retryAttempt;
			try {
				const separator = endpoint.includes('?') ? '&' : '?';
				const res = await fetch(`${endpoint}${separator}_=${Date.now()}`);
				if (!res.ok) {
					throw new Error(`HTTP ${res.status}: ${res.statusText}`);
				}
				const newData = await res.json();
				internalData = newData;
				lastFetchTime = Date.now();
				onDataLoaded(newData);
				setCachedData(newData);
				currentRetry = 0;
				error = null;
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : 'Failed to fetch data';
				if (retryAttempt < retryCount) {
					logger.warn(`[${label}] Retry ${retryAttempt + 1}/${retryCount}:`, errorMsg);
					const delay = retryDelay * Math.pow(2, retryAttempt);
					await new Promise((resolve) => setTimeout(resolve, delay));
					return fetchData(retryAttempt + 1);
				}
				error = errorMsg;
				logger.error(`[${label}] Failed after ${retryCount} attempts:`, error);
			} finally {
				loading = false;
			}
		}
		async function refresh() {
			if (cacheKey && typeof window !== 'undefined') {
				localStorage.removeItem(`widget_cache_${cacheKey}`);
			}
			currentRetry = 0;
			await fetchData();
		}
		function updateWidgetState(key, value) {
			widgetState = { ...widgetState, [key]: value };
		}
		function getWidgetState(key) {
			return widgetState[key];
		}
		function getLastUpdateText() {
			if (!lastFetchTime) return '';
			const seconds = Math.floor((Date.now() - lastFetchTime) / 1e3);
			if (seconds < 60) return `${seconds}s ago`;
			const minutes = Math.floor(seconds / 60);
			if (minutes < 60) return `${minutes}m ago`;
			const hours = Math.floor(minutes / 60);
			return `${hours}h ago`;
		}
		$$renderer2.push(
			`<article class="widget-base-container text-text-900 dark:text-text-100 group relative flex h-full flex-col rounded-lg border border-surface-200 bg-white shadow-sm transition-all duration-150 focus-within:ring-2 focus-within:ring-primary-200 dark:text-surface-50 dark:bg-surface-800"${attr('aria-labelledby', `widget-title-${stringify(widgetId || label)}`)} style="overflow: visible;"><header class="widget-header flex cursor-grab items-center justify-between border-b border-gray-100 bg-white py-2 pl-4 pr-2 dark:text-surface-50 dark:bg-surface-800" style="touch-action: none; overflow: visible; position: relative; z-index: 10;"><div class="flex flex-1 flex-col gap-0.5"><h2${attr('id', `widget-title-${stringify(widgetId || label)}`)} class="font-display text-text-900 dark:text-text-100 flex items-center gap-2 truncate text-base font-semibold tracking-tight">`
		);
		if (icon) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<iconify-icon${attr('icon', icon)} width="24"${attr_class(clsx(theme === 'light' ? 'text-tertiary-600' : 'text-primary-400'))}></iconify-icon>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> <span class="truncate">${escape_html(label)}</span></h2> `);
		if (endpoint && lastFetchTime && showRefreshButton) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<div class="flex items-center gap-2 text-xs text-surface-500"><span>${escape_html(getLastUpdateText())}</span> `);
			if (loading) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<span class="flex items-center gap-1"><iconify-icon icon="mdi:loading" class="animate-spin" width="10"></iconify-icon> `);
				if (currentRetry > 0) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`<span>Retry ${escape_html(currentRetry)}/${escape_html(retryCount)}</span>`);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--></span>`);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div> <div class="flex items-center gap-1">`);
		if (endpoint && showRefreshButton) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<button class="variant-outline-surface btn-icon" aria-label="Refresh widget"${attr('disabled', loading, true)} title="Refresh data"><iconify-icon icon="mdi:refresh" width="16"${attr_class(clsx(loading ? 'animate-spin' : ''))}></iconify-icon></button>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--> <div class="relative" style="overflow: visible;"><button class="variant-outline-surface btn-icon" aria-label="Change widget size"><iconify-icon icon="mdi:dots-vertical" width="18"></iconify-icon></button> `
		);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--></div> <button class="variant-outline-surface btn-icon"${attr('aria-label', `Remove ${stringify(label)} widget`)}><iconify-icon icon="mdi:close" width="18"></iconify-icon></button></div></header> <section class="widget-body relative min-h-[50px] flex-1 bg-white px-3 pb-2 dark:bg-surface-800" style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: stretch; align-items: stretch;">`
		);
		if (endpoint && loading && !internalData) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<div class="loading-state text-text-400 absolute inset-0 flex items-center justify-center text-base">Loading...</div>`);
		} else {
			$$renderer2.push('<!--[!-->');
			if (endpoint && error && !internalData) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<div class="error-state absolute inset-0 flex flex-col items-center justify-center p-2 text-center text-base text-error-500"><iconify-icon icon="mdi:alert-circle-outline" width="24" class="mb-1"></iconify-icon> <span>${escape_html(error)}</span></div>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
				if (children) {
					$$renderer2.push('<!--[-->');
					children($$renderer2, {
						data: internalData,
						updateWidgetState,
						getWidgetState,
						refresh,
						isLoading: loading,
						error
					});
					$$renderer2.push(`<!---->`);
				} else {
					$$renderer2.push('<!--[!-->');
					if (internalData) {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(
							`<pre class="text-text-700 dark:text-text-200 whitespace-pre-wrap break-all text-sm" style="width: 100%; height: 100%;">${escape_html(JSON.stringify(internalData, null, 2))}</pre>`
						);
					} else {
						$$renderer2.push('<!--[!-->');
						$$renderer2.push(`<div class="text-text-400 absolute inset-0 flex items-center justify-center text-base">No content.</div>`);
					}
					$$renderer2.push(`<!--]-->`);
				}
				$$renderer2.push(`<!--]-->`);
			}
			$$renderer2.push(`<!--]-->`);
		}
		$$renderer2.push(`<!--]--></section> `);
		if (resizable) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<div class="resize-handles pointer-events-none absolute inset-0"><!--[-->`);
			const each_array_1 = ensure_array_like([
				{
					dir: 'nw',
					classes: 'top-0 left-0 cursor-nw-resize',
					icon: 'clarity:drag-handle-corner-line',
					size: '12px',
					rotation: 'rotate-180'
				},
				{
					dir: 'n',
					classes: 'top-0 left-1/2 cursor-n-resize',
					icon: 'mdi:drag-vertical',
					size: '12px',
					style: 'transform: translateX(-50%) rotate(90deg);',
					rotation: ''
				},
				{
					dir: 'ne',
					classes: 'top-0 right-0 cursor-ne-resize',
					icon: 'clarity:drag-handle-corner-line',
					size: '12px',
					rotation: '-rotate-90'
				},
				{
					dir: 'e',
					classes: 'top-1/2 right-0 cursor-e-resize',
					icon: 'mdi:drag-vertical',
					size: '12px',
					style: 'transform: translateY(-50%) rotate(180deg);',
					rotation: ''
				},
				{
					dir: 'se',
					classes: 'bottom-0 right-0 cursor-se-resize',
					icon: 'clarity:drag-handle-corner-line',
					size: '12px',
					rotation: ''
				},
				{
					dir: 's',
					classes: 'bottom-0 left-1/2 cursor-s-resize',
					icon: 'mdi:drag-vertical',
					size: '12px',
					style: 'transform: translateX(-50%) rotate(90deg);',
					rotation: ''
				},
				{
					dir: 'sw',
					classes: 'bottom-0 left-0 cursor-sw-resize',
					icon: 'clarity:drag-handle-corner-line',
					size: '12px',
					rotation: 'rotate-90'
				},
				{
					dir: 'w',
					classes: 'top-1/2 left-0 cursor-w-resize',
					icon: 'mdi:drag-vertical',
					size: '12px',
					style: 'transform: translateY(-50%) rotate(180deg);',
					rotation: ''
				}
			]);
			for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
				let handle = each_array_1[$$index_1];
				$$renderer2.push(
					`<div${attr_class(`pointer-events-auto absolute z-20 flex items-center justify-center opacity-0 transition-all duration-200 hover:scale-125 hover:opacity-100 group-hover:opacity-60 ${stringify(handle.classes)} ${stringify(handle.rotation)}`)}${attr_style(`width: 16px; height: 16px; ${stringify(handle.style || '')}`)}${attr('data-direction', handle.dir)}${attr('title', `Resize widget by dragging ${stringify(handle.dir)}`)}${attr('aria-label', `Resize widget ${stringify(handle.dir)}`)} role="button" tabindex="0"><iconify-icon${attr('icon', handle.icon)}${attr('width', handle.size)} class="text-gray-900 drop-shadow-sm dark:text-surface-300"></iconify-icon></div>`
				);
			}
			$$renderer2.push(`<!--]--></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></article>`);
	});
}
export { BaseWidget as B };
//# sourceMappingURL=BaseWidget.js.map
