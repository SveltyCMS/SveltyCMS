import { g as attr_class, d as escape_html, c as stringify, b as attr_style, a as attr, i as clsx } from './index5.js';
import { Chart, BarController, BarElement, CategoryScale, LinearScale } from 'chart.js';
import { o as onDestroy } from './index-server.js';
import { B as BaseWidget } from './BaseWidget.js';
const widgetMeta = {
	name: 'Disk Usage',
	icon: 'mdi:disk',
	defaultSize: { w: 1, h: 2 }
};
function DiskWidget($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		Chart.register(BarController, BarElement, CategoryScale, LinearScale);
		const {
			label = 'Disk Usage',
			theme = 'light',
			icon = 'mdi:harddisk',
			widgetId = void 0,
			size = { w: 1, h: 2 },
			onSizeChange = (_newSize) => {},
			onRemove = () => {}
		} = $$props;
		onDestroy(() => {});
		{
			let children = function ($$renderer3, { data: fetchedData }) {
				if (fetchedData?.diskInfo?.root) {
					$$renderer3.push('<!--[-->');
					const diskInfo = fetchedData.diskInfo.root;
					const totalGB = typeof diskInfo.totalGb === 'string' ? parseFloat(diskInfo.totalGb) : diskInfo.totalGb || 0;
					const usedGB = typeof diskInfo.usedGb === 'string' ? parseFloat(diskInfo.usedGb) : diskInfo.usedGb || 0;
					const freeGB = typeof diskInfo.freeGb === 'string' ? parseFloat(diskInfo.freeGb) : diskInfo.freeGb || 0;
					const usedPercentage = typeof diskInfo.usedPercentage === 'string' ? parseFloat(diskInfo.usedPercentage) : diskInfo.usedPercentage || 0;
					const freePercentage = 100 - usedPercentage;
					const usageLevel = usedPercentage > 85 ? 'high' : usedPercentage > 70 ? 'medium' : 'low';
					$$renderer3.push(
						`<div class="flex h-full flex-col justify-between space-y-3" role="region" aria-label="Disk usage statistics"><div class="flex-1 space-y-2"><div class="flex items-center justify-between px-2"><div class="flex items-center space-x-2"><div class="relative"><div${attr_class(`h-3 w-3 rounded-full ${stringify(usageLevel === 'high' ? 'bg-red-500' : usageLevel === 'medium' ? 'bg-yellow-500' : 'bg-green-500')}`)}></div> <div${attr_class(`absolute inset-0 h-3 w-3 rounded-full text-white dark:text-black ${stringify(usageLevel === 'high' ? 'bg-red-500' : usageLevel === 'medium' ? 'bg-yellow-500' : 'bg-green-500')} animate-ping opacity-75`)}></div></div> <span class="text-sm font-bold">${escape_html(usedPercentage.toFixed(1))}%</span> <span${attr_class(`text-sm ${stringify(theme === 'dark' ? 'text-gray-400' : 'text-gray-500')}`)}>Used</span></div> <div class="flex gap-2 text-right"><div class="text-sm font-semibold">${escape_html(freePercentage.toFixed(1))}%</div> <div${attr_class(`text-sm ${stringify(theme === 'dark' ? 'text-gray-400' : 'text-gray-500')}`)}>Free</div></div></div> <h3 class="text-center text-xs font-semibold">Disk Usage Overview:</h3> `
					);
					if (diskInfo) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<div class="relative flex-1" style="min-height: 50px; max-height: 65px; width: 100%;"><canvas class="h-full w-full" style="display: block; width: 100% !important; height: 100% !important;" aria-label="Disk usage bar chart"></canvas></div>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
						$$renderer3.push(
							`<div class="relative flex flex-1 items-center justify-center rounded-lg bg-gray-100" style="min-height: 50px; max-height: 65px; width: 100%;"><span class="text-xs text-gray-500">No disk data</span></div>`
						);
					}
					$$renderer3.push(
						`<!--]--></div> <div class="flex-1 space-y-2"><h3 class="text-center text-xs font-semibold">Storage Details:</h3> <div class="flex flex-1 flex-col space-y-3" style="min-height: 60px; max-height: 80px;"><div${attr_class(`relative flex items-center overflow-hidden rounded-full ${stringify(theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200')}`)} aria-label="Disk usage progress bar" style="height: 24px; min-height: 24px;"><div${attr_class(`h-full rounded-full transition-all duration-700 ease-out ${stringify(usageLevel === 'high' ? 'bg-linear-to-r from-red-500 to-red-600' : usageLevel === 'medium' ? 'bg-linear-to-r from-orange-500 to-red-500' : 'bg-linear-to-r from-blue-500 to-blue-600')}`)}${attr_style(`width: ${stringify(usedPercentage)}%`)}${attr('aria-valuenow', usedPercentage)} aria-valuemin="0" aria-valuemax="100" role="progressbar"></div> <div class="pointer-events-none absolute inset-0 flex items-center justify-center"><span class="text-xs font-semibold text-white drop-shadow-sm dark:text-black">${escape_html(usedGB.toFixed(1))} GB Used</span></div></div> <div${attr_class(`grid ${stringify(size.w === 1 ? 'grid-cols-2' : 'grid-cols-3')} flex-1 gap-2 text-xs`)}><div class="flex flex-col space-y-1 text-center"><span${attr_class(clsx(theme === 'dark' ? 'text-gray-400' : 'text-gray-500'))}>Total</span> <span class="text-sm font-semibold">${escape_html(totalGB.toFixed(1))} GB</span></div> <div class="flex flex-col space-y-1 text-center"><span${attr_class(clsx(theme === 'dark' ? 'text-gray-400' : 'text-gray-500'))}>Used</span> <span${attr_class(`text-sm font-semibold ${stringify(usageLevel === 'high' ? 'text-red-600 dark:text-red-400' : usageLevel === 'medium' ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400')}`)}>${escape_html(usedGB.toFixed(1))} GB</span></div> `
					);
					if (size.w > 1) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<div class="flex flex-col space-y-1 text-center"><span${attr_class(clsx(theme === 'dark' ? 'text-gray-400' : 'text-gray-500'))}>Free</span> <span${attr_class(`font-semibold ${stringify(theme === 'dark' ? 'text-gray-300' : 'text-gray-700')}`)}>${escape_html(freeGB.toFixed(1))} GB</span></div>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--></div></div></div> `);
					if (size.w >= 2) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<div${attr_class(`flex justify-between text-xs ${stringify(theme === 'dark' ? 'text-gray-400' : 'text-gray-500')} border-t border-gray-200 pt-2 dark:border-gray-700`)}><span>Mount: <span class="font-mono">${escape_html(diskInfo.mountPoint || '/')}</span></span> `
						);
						if (diskInfo.filesystem) {
							$$renderer3.push('<!--[-->');
							$$renderer3.push(`<span>FS: <span class="font-mono">${escape_html(diskInfo.filesystem)}</span></span>`);
						} else {
							$$renderer3.push('<!--[!-->');
						}
						$$renderer3.push(`<!--]--></div>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--></div>`);
				} else {
					$$renderer3.push('<!--[!-->');
					$$renderer3.push(
						`<div class="flex h-full flex-col items-center justify-center space-y-3" role="status" aria-live="polite"><div class="relative"><div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" aria-hidden="true"></div></div> <div class="text-center"><div${attr_class(`text-sm font-medium ${stringify(theme === 'dark' ? 'text-gray-300' : 'text-gray-700')}`)}>Loading disk data</div> <div${attr_class(`text-xs ${stringify(theme === 'dark' ? 'text-gray-400' : 'text-gray-500')}`)}>Please wait...</div></div></div>`
					);
				}
				$$renderer3.push(`<!--]-->`);
			};
			BaseWidget($$renderer2, {
				label,
				theme,
				endpoint: '/api/dashboard/systemInfo?type=disk',
				pollInterval: 1e4,
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
export { DiskWidget as default, widgetMeta };
//# sourceMappingURL=DiskWidget.js.map
