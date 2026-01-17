import { d as escape_html, g as attr_class, b as attr_style, c as stringify, e as ensure_array_like, a as attr, i as clsx } from './index5.js';
import { B as BaseWidget } from './BaseWidget.js';
const widgetMeta = {
	name: 'Cache Monitor',
	icon: 'mdi:database-clock',
	description: 'Monitor cache performance and hit rates',
	defaultSize: { w: 2, h: 3 },
	category: 'monitoring'
};
function CacheMonitorWidget($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const {
			label = 'Cache Monitor',
			theme = 'light',
			icon = 'mdi:database-clock',
			widgetId = void 0,
			size = { w: 2, h: 3 },
			onSizeChange = (_newSize) => {},
			onRemove = () => {}
		} = $$props;
		function getHitRateColor(hitRate) {
			if (hitRate >= 90) return 'text-success-500';
			if (hitRate >= 70) return 'text-warning-500';
			return 'text-error-500';
		}
		function formatNumber(num) {
			if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
			if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
			return num.toString();
		}
		function getCategoryIcon(category) {
			const icons = {
				SCHEMA: 'mdi:database-outline',
				WIDGET: 'mdi:widgets-outline',
				THEME: 'mdi:palette-outline',
				CONTENT: 'mdi:file-document-outline',
				MEDIA: 'mdi:image-outline',
				QUERY: 'mdi:magnify',
				SESSION: 'mdi:account-clock-outline',
				AUTH: 'mdi:shield-account-outline',
				PREFERENCE: 'mdi:cog-outline'
			};
			return icons[category] || 'mdi:folder-outline';
		}
		{
			let children = function ($$renderer3, { data }) {
				const metrics = data;
				if (!metrics) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="flex h-full items-center justify-center text-surface-500"><div class="text-center"><iconify-icon icon="mdi:database-clock" width="48" class="mb-2 opacity-50"></iconify-icon> <p>Loading cache metrics...</p></div></div>`
					);
				} else {
					$$renderer3.push('<!--[!-->');
					$$renderer3.push(
						`<div class="flex h-full flex-col space-y-3 overflow-auto p-1 text-sm"><div class="rounded-xl bg-linear-to-br from-surface-50 to-surface-100 p-4 shadow-sm dark:from-surface-800 dark:to-surface-900"><div class="mb-3 flex items-start justify-between"><div><h3 class="text-xs font-semibold uppercase tracking-wider">Overall Performance</h3> <p class="mt-1 text-xs text-surface-600 dark:text-surface-50">${escape_html(metrics.overall.totalOperations.toLocaleString())} operations</p></div> <div class="text-right"><div${attr_class(`text-3xl font-bold leading-none ${getHitRateColor(metrics.overall.hitRate)}`)}>${escape_html(metrics.overall.hitRate.toFixed(1))}%</div> <p class="mt-1 text-xs">hit rate</p></div></div> <div class="grid grid-cols-4 gap-2 text-xs"><div class="rounded-lg bg-success-50 p-2 text-center dark:bg-success-900/20"><div class="text-lg font-bold">${escape_html(formatNumber(metrics.overall.hits))}</div> <div class="mt-0.5 text-success-700 dark:text-success-500">Hits</div></div> <div class="rounded-lg bg-error-50 p-2 text-center dark:bg-error-900/20"><div class="text-lg font-bold">${escape_html(formatNumber(metrics.overall.misses))}</div> <div class="mt-0.5 text-error-700 dark:text-error-500">Misses</div></div> <div class="rounded-lg bg-primary-50 p-2 text-center dark:bg-primary-900/20"><div class="0 text-lg font-bold">${escape_html(formatNumber(metrics.overall.sets))}</div> <div class="mt-0.5 text-primary-700 dark:text-primary-500">Sets</div></div> <div class="rounded-lg bg-warning-50 p-2 text-center dark:bg-warning-900/20"><div class="text-lg font-bold">${escape_html(formatNumber(metrics.overall.deletes))}</div> <div class="mt-0.5 text-warning-700 dark:text-warning-500">Deletes</div></div></div> <div class="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700"><div class="h-full bg-linear-to-r from-success-500 via-primary-500 to-primary-600 transition-all duration-500 ease-out"${attr_style(`width: ${stringify(metrics.overall.hitRate)}%`)}></div></div></div> `
					);
					if (Object.keys(metrics.byCategory).length > 0) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<div class="rounded-xl bg-surface-50 p-4 dark:bg-surface-800/50"><h3 class="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"><iconify-icon icon="mdi:view-grid" width="14"></iconify-icon> By Category</h3> <div class="space-y-3"><!--[-->`
						);
						const each_array = ensure_array_like(Object.entries(metrics.byCategory).slice(0, 6));
						for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
							let [category, stats] = each_array[$$index];
							$$renderer3.push(
								`<div class="group"><div class="flex items-center justify-between text-xs"><div class="flex items-center gap-2"><iconify-icon${attr('icon', getCategoryIcon(category))} width="18" class="text-surface-600 transition-colors group-hover:text-primary-500 dark:text-surface-50"></iconify-icon> <span class="font-semibold">${escape_html(category.toLowerCase())}</span></div> <div class="flex items-center gap-3"><span class="tabular-nums text-surface-500">${escape_html(formatNumber(stats.hits))}<span class="text-surface-400">/</span>${escape_html(formatNumber(stats.hits + stats.misses))}</span> <span${attr_class(`min-w-12 text-right text-sm font-bold tabular-nums ${getHitRateColor(stats.hitRate)}`)}>${escape_html(stats.hitRate.toFixed(0))}%</span></div></div> <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700"><div${attr_class(`h-full transition-all duration-300 ${stats.hitRate >= 80 ? 'bg-linear-to-r from-success-400 to-success-600' : stats.hitRate >= 60 ? 'bg-linear-to-r from-warning-400 to-warning-600' : 'bg-linear-to-r from-error-400 to-error-600'}`)}${attr_style(`width: ${stringify(stats.hitRate)}%`)}></div></div></div>`
							);
						}
						$$renderer3.push(`<!--]--></div></div>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--> `);
					if (metrics.byTenant && Object.keys(metrics.byTenant).length > 0) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<div class="rounded-xl bg-surface-50 p-4 dark:bg-surface-800/50"><h3 class="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-surface-600 dark:text-surface-50"><iconify-icon icon="mdi:domain" width="14"></iconify-icon> By Tenant</h3> <div class="space-y-2.5"><!--[-->`
						);
						const each_array_1 = ensure_array_like(Object.entries(metrics.byTenant).slice(0, 4));
						for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
							let [tenant, stats] = each_array_1[$$index_1];
							$$renderer3.push(
								`<div class="flex items-center justify-between rounded-lg bg-surface-100/50 px-3 py-2 text-xs dark:bg-surface-900/30"><div class="flex items-center gap-2"><div class="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30"><iconify-icon icon="mdi:domain" width="14" class="text-primary-600 dark:text-primary-400"></iconify-icon></div> <span class="font-semibold text-surface-700 dark:text-surface-300">${escape_html(tenant)}</span></div> <div class="flex items-center gap-3"><span class="tabular-nums text-surface-500">${escape_html(formatNumber(stats.hits + stats.misses))} ops</span> <span${attr_class(`min-w-12 text-right font-bold tabular-nums ${getHitRateColor(stats.hitRate)}`)}>${escape_html(stats.hitRate.toFixed(0))}%</span></div></div>`
							);
						}
						$$renderer3.push(`<!--]--></div></div>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--> `);
					if (metrics.recentMisses && metrics.recentMisses.length > 0) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<div class="rounded-xl bg-error-50 p-4 dark:bg-error-900/10"><h3 class="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-error-700 dark:text-error-400"><iconify-icon icon="mdi:alert-circle" width="14"></iconify-icon> Recent Cache Misses (${escape_html(metrics.recentMisses.length)})</h3> <div class="max-h-48 space-y-2 overflow-y-auto"><!--[-->`
						);
						const each_array_2 = ensure_array_like(metrics.recentMisses.slice().reverse());
						for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
							let miss = each_array_2[$$index_2];
							const timeSince = Math.floor((Date.now() - new Date(miss.timestamp).getTime()) / 1e3);
							$$renderer3.push(
								`<div class="rounded-lg bg-white/50 px-3 py-2 text-xs dark:bg-surface-900/30"><div class="flex items-start justify-between gap-2"><div class="min-w-0 flex-1"><div class="mb-1 flex items-center gap-2"><iconify-icon${attr('icon', getCategoryIcon(miss.category))} width="14" class="text-error-600 dark:text-error-400"></iconify-icon> <span class="font-semibold">${escape_html(miss.category)}</span></div> <div class="truncate font-mono text-[10px] text-surface-600 dark:text-surface-50"${attr('title', miss.key)}>${escape_html(miss.key)}</div></div> <div class="whitespace-nowrap text-right"><div class="text-[10px]">`
							);
							if (timeSince < 60) {
								$$renderer3.push('<!--[-->');
								$$renderer3.push(`${escape_html(timeSince)}s ago`);
							} else {
								$$renderer3.push('<!--[!-->');
								if (timeSince < 3600) {
									$$renderer3.push('<!--[-->');
									$$renderer3.push(`${escape_html(Math.floor(timeSince / 60))}m ago`);
								} else {
									$$renderer3.push('<!--[!-->');
									$$renderer3.push(`${escape_html(Math.floor(timeSince / 3600))}h ago`);
								}
								$$renderer3.push(`<!--]-->`);
							}
							$$renderer3.push(`<!--]--></div> `);
							if (miss.tenantId) {
								$$renderer3.push('<!--[-->');
								$$renderer3.push(`<div class="mt-0.5 text-[10px] text-surface-400">${escape_html(miss.tenantId)}</div>`);
							} else {
								$$renderer3.push('<!--[!-->');
							}
							$$renderer3.push(`<!--]--></div></div></div>`);
						}
						$$renderer3.push(`<!--]--></div></div>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(
						`<!--]--> <div${attr_class(`mt-auto rounded-xl border-l-4 p-3 text-xs shadow-sm transition-all
					${metrics.overall.hitRate >= 80 ? 'border-success-500 bg-success-50 dark:bg-success-900/10' : ''}
					${metrics.overall.hitRate >= 60 && metrics.overall.hitRate < 80 ? 'border-warning-500 bg-warning-50 dark:bg-warning-900/10' : ''}
					${metrics.overall.hitRate < 60 ? 'border-error-500 bg-error-50 dark:bg-error-900/10' : ''}
				`)}><div class="flex items-center gap-2.5"><div${attr_class(`flex h-8 w-8 items-center justify-center rounded-full ${metrics.overall.hitRate >= 80 ? 'bg-success-100 dark:bg-success-900/30' : metrics.overall.hitRate >= 60 ? 'bg-warning-100 dark:bg-warning-900/30' : 'bg-error-100 dark:bg-error-900/30'}`)}><iconify-icon${attr('icon', metrics.overall.hitRate >= 80 ? 'mdi:check-circle' : metrics.overall.hitRate >= 60 ? 'mdi:alert' : 'mdi:alert-circle')} width="18"${attr_class(clsx(metrics.overall.hitRate >= 80 ? 'text-success-600 dark:text-success-400' : metrics.overall.hitRate >= 60 ? 'text-warning-600 dark:text-warning-400' : 'text-error-600 dark:text-error-400'))}></iconify-icon></div> <div class="flex-1"><div${attr_class(`font-semibold ${metrics.overall.hitRate >= 80 ? 'text-success-700 dark:text-success-300' : metrics.overall.hitRate >= 60 ? 'text-warning-700 dark:text-warning-300' : 'text-error-700 dark:text-error-300'}`)}>`
					);
					if (metrics.overall.hitRate >= 80) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`Excellent Performance`);
					} else {
						$$renderer3.push('<!--[!-->');
						if (metrics.overall.hitRate >= 60) {
							$$renderer3.push('<!--[-->');
							$$renderer3.push(`Moderate Performance`);
						} else {
							$$renderer3.push('<!--[!-->');
							$$renderer3.push(`Needs Attention`);
						}
						$$renderer3.push(`<!--]-->`);
					}
					$$renderer3.push(
						`<!--]--></div> <div class="mt-0.5">Cache is ${escape_html(metrics.overall.hitRate >= 80 ? 'working optimally' : metrics.overall.hitRate >= 60 ? 'performing adequately' : 'underperforming')}</div></div></div></div></div>`
					);
				}
				$$renderer3.push(`<!--]-->`);
			};
			BaseWidget($$renderer2, {
				label,
				theme,
				endpoint: '/api/dashboard/cache-metrics',
				pollInterval: 5e3,
				icon,
				widgetId,
				size,
				onSizeChange,
				onCloseRequest: onRemove,
				children
			});
		}
	});
}
export { CacheMonitorWidget as default, widgetMeta };
//# sourceMappingURL=CacheMonitorWidget.js.map
