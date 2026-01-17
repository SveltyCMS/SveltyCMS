import { b as attr_style, c as stringify, e as ensure_array_like, d as escape_html } from './index5.js';
import { B as BaseWidget } from './BaseWidget.js';
const widgetMeta = {
	name: 'System Messages',
	icon: 'mdi:message-alert-outline',
	defaultSize: { w: 1, h: 2 }
};
function SystemMessagesWidget($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const {
			label = 'System Messages',
			theme = 'light',
			icon = 'mdi:message-alert-outline',
			widgetId = void 0,
			size = { w: 1, h: 2 },
			onSizeChange = (_newSize) => {},
			onRemove = () => {}
		} = $$props;
		{
			let children = function ($$renderer3, { data: fetchedData }) {
				if (fetchedData && Array.isArray(fetchedData) && fetchedData.length > 0) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="grid gap-2"${attr_style(`max-height: calc(${stringify(size.h)} * 120px - 40px); overflow-y: auto;`)} role="list" aria-label="System messages"><!--[-->`
					);
					const each_array = ensure_array_like(fetchedData.slice(0, 5));
					for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
						let message = each_array[$$index];
						$$renderer3.push(
							`<div class="rounded-lg bg-surface-100/80 px-3 py-2 text-xs dark:bg-surface-700/60" role="listitem"><div class="flex items-start justify-between"><strong class="text-text-900 dark:text-text-100 text-sm" aria-label="Message title">${escape_html(message.title)}</strong> <small class="shrink-0 pl-2 text-surface-500 dark:text-surface-50" aria-label="Timestamp">${escape_html(new Date(message.timestamp).toLocaleString())}</small></div> <p class="mt-1 text-surface-700 dark:text-surface-300" aria-label="Message body">${escape_html(message.body)}</p></div>`
						);
					}
					$$renderer3.push(`<!--]--></div>`);
				} else {
					$$renderer3.push('<!--[!-->');
					$$renderer3.push(
						`<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400" role="status" aria-live="polite"><iconify-icon icon="mdi:alert-circle-outline" width="32" class="mb-2 text-surface-400 dark:text-surface-500" aria-hidden="true"></iconify-icon> <span>No system messages</span></div>`
					);
				}
				$$renderer3.push(`<!--]-->`);
			};
			BaseWidget($$renderer2, {
				label,
				theme,
				endpoint: '/api/dashboard/systemMessages',
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
export { SystemMessagesWidget as default, widgetMeta };
//# sourceMappingURL=SystemMessagesWidget.js.map
