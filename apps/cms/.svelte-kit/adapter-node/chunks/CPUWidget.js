import { g as attr_class, d as escape_html, b as attr_style, c as stringify } from './index5.js';
import { Chart, LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { o as onDestroy } from './index-server.js';
import { B as BaseWidget } from './BaseWidget.js';
const widgetMeta = {
	name: 'CPU Usage',
	icon: 'mdi:cpu-64-bit',
	defaultSize: { w: 1, h: 2 }
};
function CPUWidget($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		Chart.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);
		const {
			label = 'CPU Usage',
			theme = 'light',
			icon = 'mdi:cpu-64-bit',
			widgetId = void 0,
			size = { w: 1, h: 1 },
			onSizeChange = (_newSize) => {},
			onRemove = () => {}
		} = $$props;
		onDestroy(() => {});
		{
			let children = function ($$renderer3, { data: fetchedData }) {
				if (fetchedData?.cpuInfo) {
					$$renderer3.push('<!--[-->');
					const currentUsage = Number(fetchedData?.cpuInfo?.historicalLoad?.usage?.slice(-1)[0] || 0);
					const usageArray = fetchedData?.cpuInfo?.historicalLoad?.usage || [];
					const averageUsage = usageArray.length > 0 ? Number(usageArray.reduce((a, b) => a + b, 0) / usageArray.length) : 0;
					const usageLevel = currentUsage > 80 ? 'high' : currentUsage > 50 ? 'medium' : 'low';
					$$renderer3.push(
						`<div class="flex h-full flex-col space-y-3"><div class="flex items-center justify-between"><div class="flex flex-col space-y-1"><div class="flex items-center space-x-2"><div class="relative"><div${attr_class(`h-3 w-3 rounded-full ${stringify(usageLevel === 'high' ? 'bg-red-500' : usageLevel === 'medium' ? 'bg-yellow-500' : 'bg-green-500')}`)}></div> <div${attr_class(`absolute inset-0 h-3 w-3 rounded-full ${stringify(usageLevel === 'high' ? 'bg-red-500' : usageLevel === 'medium' ? 'bg-yellow-500' : 'bg-green-500')} animate-ping opacity-75`)}></div></div> <span class="text-sm font-bold">${escape_html(currentUsage.toFixed(1))}%</span> <span${attr_class(`text-sm ${stringify(theme === 'dark' ? 'text-gray-400' : 'text-gray-500')}`)}>Current Usage</span></div></div> <div class="flex items-center gap-2 text-right"><div class="text-sm font-semibold">${escape_html(averageUsage.toFixed(1))}%</div> <div${attr_class(`text-sm ${stringify(theme === 'dark' ? 'text-gray-400' : 'text-gray-500')}`)}>Average</div></div></div> <div class="space-y-2"><div${attr_class(`relative h-2 overflow-hidden rounded-full ${stringify(theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200')}`)}><div${attr_class(`h-full rounded-full transition-all duration-700 ease-out ${stringify(usageLevel === 'high' ? 'bg-linear-to-r from-red-500 to-red-600' : usageLevel === 'medium' ? 'bg-linear-to-r from-yellow-500 to-orange-500' : 'bg-linear-to-r from-blue-500 to-blue-600')}`)}${attr_style(`width: ${stringify(currentUsage)}%`)}></div> <div class="absolute inset-0 h-full w-full animate-pulse bg-linear-to-r from-transparent via-white to-transparent opacity-20"></div></div></div> <div class="relative grow rounded-lg"${attr_style(`min-height: ${stringify(size.h >= 2 ? '150px' : '120px')}; height: 100%;`)}><div class="relative h-full w-full"><canvas aria-label="CPU Usage Chart" class="h-full w-full" style="display: block; width: 100% !important; height: 100% !important;"></canvas></div></div> `
					);
					if (size.w >= 2 || size.h >= 2) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<div${attr_class(`flex justify-between px-2 text-xs ${stringify(theme === 'dark' ? 'text-gray-300' : 'text-gray-700')}`)}><span>Cores: <span${attr_class(`font-bold ${stringify(theme === 'dark' ? 'text-gray-400' : 'text-gray-500')}`)}>${escape_html(fetchedData?.cpuInfo?.cores?.count || 'N/A')}</span></span> <span>Model: <span${attr_class(`font-bold ${stringify(theme === 'dark' ? 'text-gray-400' : 'text-gray-500')}`)}>${escape_html(fetchedData?.cpuInfo?.cores?.perCore?.[0]?.model?.split(' ').slice(0, 2).join(' ') || 'Unknown')}</span></span></div>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--></div>`);
				} else {
					$$renderer3.push('<!--[!-->');
					$$renderer3.push(
						`<div class="flex h-full flex-col items-center justify-center space-y-3"><div class="relative"><div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div></div> <div class="text-center"><div${attr_class(`text-sm font-medium ${stringify(theme === 'dark' ? 'text-gray-300' : 'text-gray-700')}`)}>Loading CPU data</div> <div${attr_class(`text-xs ${stringify(theme === 'dark' ? 'text-gray-400' : 'text-gray-500')}`)}>Please wait...</div></div></div>`
					);
				}
				$$renderer3.push(`<!--]-->`);
			};
			BaseWidget($$renderer2, {
				label,
				theme,
				endpoint: '/api/dashboard/systemInfo?type=cpu',
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
export { CPUWidget as default, widgetMeta };
//# sourceMappingURL=CPUWidget.js.map
