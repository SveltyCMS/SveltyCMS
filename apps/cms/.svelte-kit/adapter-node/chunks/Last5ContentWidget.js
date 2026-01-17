import { e as ensure_array_like, g as attr_class, a as attr, d as escape_html, c as stringify } from './index5.js';
import { B as BaseWidget } from './BaseWidget.js';
import { formatDistanceToNow } from 'date-fns';
const widgetMeta = {
	name: 'Last 5 Content',
	icon: 'mdi:file-document-multiple-outline',
	defaultSize: { w: 1, h: 2 }
};
function Last5ContentWidget($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const {
			label = 'Last 5 Content',
			theme = 'light',
			icon = 'mdi:file-document-multiple-outline',
			widgetId = void 0,
			size = { w: 1, h: 1 },
			onSizeChange = (_newSize) => {},
			onRemove = () => {}
		} = $$props;
		function getStatusColor(status) {
			switch (status.toLowerCase()) {
				case 'published':
					return 'bg-green-500';
				case 'draft':
					return 'bg-yellow-500';
				case 'archived':
					return 'bg-gray-500';
				default:
					return 'bg-gray-400';
			}
		}
		{
			let children = function ($$renderer3, { data: fetchedData }) {
				if (fetchedData && Array.isArray(fetchedData) && fetchedData.length > 0) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="grid gap-2" style="max-height: 180px; overflow-y: auto;" role="list" aria-label="Last 5 content items"><!--[-->`
					);
					const each_array = ensure_array_like(fetchedData.slice(0, 5));
					for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
						let item = each_array[$$index];
						$$renderer3.push(
							`<div class="flex items-center justify-between rounded-lg bg-surface-100/80 px-3 py-2 text-xs dark:bg-surface-700/60" role="listitem"><div class="flex min-w-0 items-center gap-2"><div${attr_class(`h-2 w-2 rounded-full ${stringify(getStatusColor(item.status))}`)}${attr('title', `Status: ${stringify(item.status)}`)}></div> <div class="flex min-w-0 flex-col"><span class="text-text-900 dark:text-text-100 truncate font-medium"${attr('title', item.title)}>${escape_html(item.title)}</span> <span class="text-xs text-surface-500 dark:text-surface-50"${attr('title', `Collection: ${item.collection}`)}>${escape_html(item.collection)}</span></div></div> <div class="flex flex-col items-end"><span class="text-xs font-medium uppercase text-surface-600 dark:text-surface-300">${escape_html(formatDistanceToNow(new Date(item.createdAt), { addSuffix: true }))}</span> <span class="text-xs text-surface-500 dark:text-surface-50"${attr('title', `By: ${item.createdBy}`)}>${escape_html(item.createdBy)}</span></div></div>`
						);
					}
					$$renderer3.push(`<!--]--></div>`);
				} else {
					$$renderer3.push('<!--[!-->');
					$$renderer3.push(
						`<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400" role="status" aria-live="polite"><iconify-icon icon="mdi:file-remove-outline" width="32" class="mb-2 text-surface-400 dark:text-surface-500" aria-hidden="true"></iconify-icon> <span>No content found</span></div>`
					);
				}
				$$renderer3.push(`<!--]-->`);
			};
			BaseWidget($$renderer2, {
				label,
				theme,
				endpoint: '/api/dashboard/last5Content',
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
export { Last5ContentWidget as default, widgetMeta };
//# sourceMappingURL=Last5ContentWidget.js.map
