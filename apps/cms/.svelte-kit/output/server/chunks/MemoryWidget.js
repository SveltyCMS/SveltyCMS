import { g as attr_class, d as escape_html, c as stringify, i as clsx } from './index5.js';
import { Chart, PieController, ArcElement, Tooltip } from 'chart.js';
import { o as onDestroy } from './index-server.js';
import { B as BaseWidget } from './BaseWidget.js';
const widgetMeta = {
	name: 'Memory Usage',
	icon: 'mdi:memory',
	defaultSize: { w: 1, h: 2 }
};
function MemoryWidget($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		Chart.register(PieController, ArcElement, Tooltip);
		const {
			label = 'Memory Usage',
			theme = 'light',
			icon = 'mdi:memory',
			widgetId = void 0,
			size = { w: 1, h: 2 },
			onSizeChange = (_newSize) => {},
			onRemove = () => {}
		} = $$props;
		onDestroy(() => {});
		{
			let children = function ($$renderer3, { data: fetchedData }) {
				if (fetchedData?.memoryInfo?.total) {
					$$renderer3.push('<!--[-->');
					const totalMemGB = (fetchedData.memoryInfo.total.totalMemMb || 0) / 1024;
					const usedMemGB = (fetchedData.memoryInfo.total.usedMemMb || 0) / 1024;
					const freeMemGB = (fetchedData.memoryInfo.total.freeMemMb || 0) / 1024;
					const usedPercentage = fetchedData.memoryInfo.total.usedMemPercentage || 0;
					const usageLevel = usedPercentage > 80 ? 'high' : usedPercentage > 60 ? 'medium' : 'low';
					const freePercentage = 100 - usedPercentage;
					$$renderer3.push(
						`<div class="flex h-full flex-col justify-between space-y-3" role="region" aria-label="Memory usage statistics"><div class="flex items-center space-x-3"><div class="flex items-center space-x-2"><div class="relative"><div${attr_class(`h-3 w-3 rounded-full ${stringify(usageLevel === 'high' ? 'bg-red-500' : usageLevel === 'medium' ? 'bg-yellow-500' : 'bg-green-500')}`)}></div> <div${attr_class(`absolute inset-0 h-3 w-3 rounded-full ${stringify(usageLevel === 'high' ? 'bg-red-500' : usageLevel === 'medium' ? 'bg-yellow-500' : 'bg-green-500')} animate-ping opacity-75`)}></div></div> <div class="flex w-full items-center justify-between"><div class="flex gap-2"><div class="text-sm font-bold" aria-live="polite">${escape_html(usedPercentage.toFixed(1))}%</div> <div${attr_class(`text-sm ${stringify(theme === 'dark' ? 'text-gray-400' : 'text-gray-500')}`)}>Memory Used</div></div> <div class="flex gap-2"><div class="text-sm font-bold" aria-live="polite">${escape_html(freePercentage.toFixed(1))}%</div> <div${attr_class(`text-sm ${stringify(theme === 'dark' ? 'text-gray-400' : 'text-gray-500')}`)}>Memory Free</div></div></div></div></div> <h3${attr_class(`text-xs font-semibold ${stringify(theme === 'dark' ? 'text-gray-300' : 'text-gray-700')} text-center`)}>Memory Usage Overview</h3> <div class="relative shrink-0" style="height: 120px; min-height: 80px; max-height: 180px; width: 100%;"><canvas class="h-full w-full" style="display: block; width: 100% !important; height: 100% !important;" aria-label="Memory usage pie chart"></canvas></div> <h3${attr_class(`text-xs font-semibold ${stringify(theme === 'dark' ? 'text-gray-300' : 'text-gray-700')} text-center`)}>Memory Statistics</h3> <div class="shrink-0 space-y-3"><div${attr_class(`grid ${stringify(size.w === 1 ? 'grid-cols-2' : 'grid-cols-3')} gap-3 text-xs`)}><div class="flex flex-col text-center"><span${attr_class(clsx(theme === 'dark' ? 'text-gray-400' : 'text-gray-500'))}>Total</span> <span class="text-sm font-semibold">${escape_html(totalMemGB.toFixed(1))} GB</span></div> <div class="flex flex-col text-center"><span${attr_class(clsx(theme === 'dark' ? 'text-gray-400' : 'text-gray-500'))}>Used</span> <span${attr_class(`text-sm font-semibold ${stringify(usageLevel === 'high' ? 'text-red-600 dark:text-red-400' : usageLevel === 'medium' ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400')}`)}>${escape_html(usedMemGB.toFixed(1))} GB</span></div> `
					);
					if (size.w !== 1) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<div class="flex flex-col space-y-1 text-center"><span${attr_class(clsx(theme === 'dark' ? 'text-gray-400' : 'text-gray-500'))}>Free</span> <span${attr_class(`font-semibold ${stringify(theme === 'dark' ? 'text-gray-300' : 'text-gray-700')}`)}>${escape_html(freeMemGB.toFixed(1))} GB</span></div>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--></div></div></div>`);
				} else {
					$$renderer3.push('<!--[!-->');
					$$renderer3.push(
						`<div class="flex h-full flex-col items-center justify-center space-y-3" role="status" aria-live="polite"><div class="relative"><div class="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" aria-hidden="true"></div></div> <div class="text-center"><div${attr_class(`text-sm font-medium ${stringify(theme === 'dark' ? 'text-gray-300' : 'text-gray-700')}`)}>Loading memory data</div> <div class="text-xs">Please wait...</div></div></div>`
					);
				}
				$$renderer3.push(`<!--]-->`);
			};
			BaseWidget($$renderer2, {
				label,
				theme,
				endpoint: '/api/dashboard/systemInfo?type=memory',
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
export { MemoryWidget as default, widgetMeta };
//# sourceMappingURL=MemoryWidget.js.map
