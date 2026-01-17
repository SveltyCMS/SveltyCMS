import { e as ensure_array_like, a as attr, d as escape_html } from './index5.js';
import { f as formatDisplayDate } from './dateUtils.js';
import { B as BaseWidget } from './BaseWidget.js';
const widgetMeta = {
	name: 'Last 5 Media',
	icon: 'mdi:image-multiple-outline',
	defaultSize: { w: 1, h: 2 }
};
function Last5MediaWidget($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const {
			label = 'Last 5 Media',
			theme = 'light',
			icon = 'mdi:image-multiple-outline',
			widgetId = void 0,
			size = { w: 1, h: 1 },
			onSizeChange = (_newSize) => {},
			onRemove = () => {}
		} = $$props;
		function formatFileSize(bytes) {
			if (bytes === 0) return '0 B';
			const k = 1024;
			const sizes = ['B', 'KB', 'MB', 'GB'];
			const i = Math.floor(Math.log(bytes) / Math.log(k));
			return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
		}
		function getFileIcon(type) {
			if (!type) return 'mdi:file';
			const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
			const videoTypes = ['mp4', 'mov', 'avi'];
			if (imageTypes.includes(type.toLowerCase())) {
				return 'mdi:image';
			} else if (videoTypes.includes(type.toLowerCase())) {
				return 'mdi:video';
			}
			return 'mdi:file';
		}
		{
			let children = function ($$renderer3, { data: fetchedData }) {
				if (fetchedData && Array.isArray(fetchedData) && fetchedData.length > 0) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="grid gap-2" style="max-height: 180px; overflow-y: auto;" role="list" aria-label="Last 5 media files"><!--[-->`
					);
					const each_array = ensure_array_like(fetchedData.slice(0, 5));
					for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
						let file = each_array[$$index];
						$$renderer3.push(
							`<div class="flex items-center justify-between rounded-lg bg-surface-100/80 px-3 py-2 text-xs dark:bg-surface-700/60" role="listitem"><div class="flex min-w-0 items-center gap-2"><iconify-icon${attr('icon', getFileIcon(file.type))} class="shrink-0 text-primary-400" width="18"${attr('aria-label', file.type + ' file icon')}></iconify-icon> <div class="flex min-w-0 flex-col"><span class="text-text-900 dark:text-text-100 truncate font-medium"${attr('title', file.name)}>${escape_html(file.name)}</span> <span class="text-xs text-surface-500 dark:text-surface-50"${attr('title', `Size: ${formatFileSize(file.size)}`)}>${escape_html(formatFileSize(file.size))}</span></div></div> <div class="flex flex-col items-end"><span class="text-xs font-medium uppercase text-surface-600 dark:text-surface-300">${escape_html(file.type)}</span> <span class="text-xs text-surface-500 dark:text-surface-50"${attr('title', `Modified: ${formatDisplayDate(file.modified)}`)}>${escape_html(formatDisplayDate(file.modified))}</span></div></div>`
						);
					}
					$$renderer3.push(`<!--]--></div>`);
				} else {
					$$renderer3.push('<!--[!-->');
					$$renderer3.push(
						`<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400" role="status" aria-live="polite"><iconify-icon icon="mdi:file-remove-outline" width="32" class="mb-2 text-surface-400 dark:text-surface-500" aria-hidden="true"></iconify-icon> <span>No media files found</span></div>`
					);
				}
				$$renderer3.push(`<!--]-->`);
			};
			BaseWidget($$renderer2, {
				label,
				theme,
				endpoint: '/api/dashboard/last5media',
				pollInterval: 3e4,
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
export { Last5MediaWidget as default, widgetMeta };
//# sourceMappingURL=Last5MediaWidget.js.map
