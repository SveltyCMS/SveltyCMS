import { e as ensure_array_like, d as escape_html, a as attr, b as attr_style, c as stringify, g as attr_class } from './index5.js';
import { B as BaseWidget } from './BaseWidget.js';
import { T as TablePagination } from './TablePagination.js';
const widgetMeta = {
	name: 'Logs',
	icon: 'mdi:text-box-outline',
	defaultSize: { w: 2, h: 2 }
};
function LogsWidget($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const {
			label = 'System Logs',
			icon = 'mdi:file-document-outline',
			widgetId = void 0,
			size = { w: 2, h: 2 },
			onSizeChange = (_newSize) => {},
			onRemove = () => {},
			endpoint = '/api/dashboard/logs',
			pollInterval = 15e3
		} = $$props;
		let currentPage = 1;
		let logsPerPage = 20;
		let filterLevel = 'all';
		let searchText = '';
		let startDate = '';
		let endDate = '';
		let triggerFetchFlag = 0;
		const getQueryParams = () => {
			const params = new URLSearchParams();
			if (filterLevel !== 'all') params.append('level', filterLevel);
			params.append('page', currentPage.toString());
			params.append('limit', logsPerPage.toString());
			return params.toString();
		};
		const onUpdatePage = (page) => {
			currentPage = page;
			triggerFetchFlag++;
		};
		const onUpdateRowsPerPage = (rows) => {
			logsPerPage = rows;
			currentPage = 1;
			triggerFetchFlag++;
		};
		const handleFilterLevelChange = (newLevel) => {
			filterLevel = newLevel;
			currentPage = 1;
			triggerFetchFlag++;
		};
		const dynamicEndpoint = `${endpoint}?${getQueryParams()}&_t=${triggerFetchFlag}`;
		const logLevelOptions = [
			{ value: 'all', label: 'All Levels' },
			{ value: 'fatal', label: 'Fatal' },
			{ value: 'error', label: 'Error' },
			{ value: 'warn', label: 'Warn' },
			{ value: 'info', label: 'Info' },
			{ value: 'debug', label: 'Debug' },
			{ value: 'trace', label: 'Trace' }
		];
		const getLogLevelColor = (level) => {
			switch (level.toLowerCase()) {
				case 'fatal':
					return 'text-purple-500 dark:text-purple-400';
				case 'error':
					return 'text-red-500 dark:text-red-400';
				case 'warn':
					return 'text-yellow-500 dark:text-yellow-400';
				case 'info':
					return 'text-green-500 dark:text-green-400';
				case 'debug':
					return 'text-blue-500 dark:text-blue-400';
				case 'trace':
					return 'text-cyan-500 dark:text-cyan-400';
				default:
					return 'text-gray-700 dark:text-gray-300';
			}
		};
		{
			let children = function ($$renderer3, { data: fetchedData }) {
				$$renderer3.push(
					`<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" role="region" aria-label="Log controls"><div class="flex flex-1 gap-2">`
				);
				$$renderer3.select(
					{
						value: filterLevel,
						onchange: (e) => handleFilterLevelChange(e.target.value),
						class:
							'rounded border border-surface-300 bg-white px-8 py-1 text-sm text-surface-700 shadow-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-200 dark:border-surface-400 dark:bg-surface-800 dark:text-surface-100 dark:focus:border-primary-500',
						'aria-label': 'Filter log level'
					},
					($$renderer4) => {
						$$renderer4.push(`<!--[-->`);
						const each_array = ensure_array_like(logLevelOptions);
						for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
							let { value, label: label2 } = each_array[$$index];
							$$renderer4.option({ value }, ($$renderer5) => {
								$$renderer5.push(`${escape_html(label2)}`);
							});
						}
						$$renderer4.push(`<!--]-->`);
					}
				);
				$$renderer3.push(
					` <input type="text" placeholder="Search logs..."${attr('value', searchText)} class="rounded border border-surface-300 bg-white px-3 py-1 text-sm text-surface-700 shadow-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-200 dark:border-surface-400 dark:bg-surface-800 dark:text-surface-100 dark:focus:border-primary-500" aria-label="Search logs"/></div> <div class="flex items-center gap-2"><input type="date"${attr('value', startDate)} class="rounded border border-surface-300 bg-white px-2 py-1 text-sm text-surface-700 shadow-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-200 dark:border-surface-400 dark:bg-surface-800 dark:text-surface-100 dark:focus:border-primary-500" aria-label="Start date"/> <input type="date"${attr('value', endDate)} class="rounded border border-surface-300 bg-white px-2 py-1 text-sm text-surface-700 shadow-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-200 dark:border-surface-400 dark:bg-surface-800 dark:text-surface-100 dark:focus:border-primary-500" aria-label="End date"/></div></div> `
				);
				if (fetchedData && fetchedData.logs && fetchedData.logs.length > 0) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="flex flex-col gap-1 overflow-y-auto"${attr_style(`max-height: calc(${stringify(size.h)} * 120px - 120px);`)} role="list" aria-label="System log entries"><!--[-->`
					);
					const each_array_1 = ensure_array_like(fetchedData.logs);
					for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
						let log = each_array_1[$$index_1];
						$$renderer3.push(
							`<div class="flex items-center gap-1 rounded border border-surface-200 bg-surface-50/50 px-1 py-1 text-xs dark:text-surface-50 dark:bg-surface-800/30" role="listitem"><iconify-icon icon="mdi:circle" width="8"${attr_class(`${stringify(getLogLevelColor(log.level))} shrink-0`)}${attr('aria-label', `${stringify(log.level)} log level`)}></iconify-icon> <span class="w-8 shrink-0 text-xs text-surface-500 dark:text-surface-50">${escape_html(new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }))}</span> <span${attr_class(`w-14 shrink-0 text-xs font-medium ${stringify(getLogLevelColor(log.level))}`)}>${escape_html(log.level.toUpperCase())}</span> <span class="text-text-900 dark:text-text-100 flex-1 select-text truncate text-xs" style="user-select: text;"${attr('title', log.message)}>${escape_html(log.message)}</span></div>`
						);
					}
					$$renderer3.push(`<!--]--></div> <div class="mt-auto flex items-center justify-between pt-2">`);
					TablePagination($$renderer3, {
						currentPage: fetchedData.page || 1,
						rowsPerPage: logsPerPage,
						rowsPerPageOptions: [10, 20, 50, 100],
						totalItems: fetchedData.total || 0,
						pagesCount: fetchedData.hasMore ? (fetchedData.page || 1) + 1 : fetchedData.page || 1,
						onUpdatePage,
						onUpdateRowsPerPage
					});
					$$renderer3.push(`<!----></div>`);
				} else {
					$$renderer3.push('<!--[!-->');
					$$renderer3.push(
						`<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400" role="status" aria-live="polite"><iconify-icon icon="mdi:file-remove-outline" width="32" class="mb-2 text-surface-400 dark:text-surface-500" aria-hidden="true"></iconify-icon> <span>No logs found</span></div>`
					);
				}
				$$renderer3.push(`<!--]-->`);
			};
			BaseWidget($$renderer2, {
				label,
				endpoint: dynamicEndpoint,
				pollInterval,
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
export { LogsWidget as default, widgetMeta };
//# sourceMappingURL=LogsWidget.js.map
