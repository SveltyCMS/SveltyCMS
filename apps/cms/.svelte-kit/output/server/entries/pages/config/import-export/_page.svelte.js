import { a as attr, d as escape_html, e as ensure_array_like, l as head } from '../../../../chunks/index5.js';
import { P as PageTitle } from '../../../../chunks/PageTitle.js';
import { logger } from '../../../../chunks/logger.js';
/* empty css                                                       */
/* empty css                                                                   */
import { g as getCollections, s as showToast } from '../../../../chunks/apiClient.js';
function ImportExportManager($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let collections = [];
		let loading = false;
		const exportOptions = {
			format: 'json',
			collections: [],
			includeMetadata: true,
			limit: void 0
		};
		loadCollections();
		async function loadCollections() {
			try {
				loading = true;
				const response = await getCollections({ includeFields: false });
				if (response.success && response.data) {
					let rawCollections = [];
					if (Array.isArray(response.data)) {
						rawCollections = response.data;
					} else if (response.data && typeof response.data === 'object' && 'collections' in response.data) {
						rawCollections = response.data.collections || [];
					}
					collections = rawCollections.map((col) => ({
						id: col.id || col.name,
						name: col.name,
						label: col.label || col.name,
						description: col.description
					}));
					exportOptions.collections = collections.map((c) => String(c.id));
				} else {
					showAlertMessage('Failed to load collections', 'error');
				}
			} catch (error) {
				logger.error('Error loading collections:', error);
				showAlertMessage('Error loading collections', 'error');
			} finally {
				loading = false;
			}
		}
		function showAlertMessage(message, type) {
			showToast(message, type, 5e3);
		}
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			$$renderer3.push(
				`<div class="import-export-manager svelte-ojvkgp"><div class="mb-6 flex items-center justify-between"><div><h2 class="text-2xl font-bold text-gray-900 dark:text-white">Data Import &amp; Export</h2> <p class="mt-1 text-gray-600 dark:text-gray-400">Backup and restore your collection data</p></div> <div class="flex gap-3"><button class="preset-outlined-secondary-500 btn"${attr('disabled', loading, true)}><iconify-icon icon="mdi:export" width="24"></iconify-icon> Export Data</button> <button class="preset-outlined-primary-500 btn"${attr('disabled', loading, true)}><iconify-icon icon="mdi:import" width="24"></iconify-icon> Import Data</button></div></div> <div class="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2"><div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"><div class="mb-4 flex items-center"><div class="preset-filled-tertiary-500 btn-icon mr-3"><iconify-icon icon="mdi:database-export" width="24"></iconify-icon></div> <div><h3 class="font-semibold text-gray-900 dark:text-white">Export All Data</h3> <p class="text-sm text-gray-600 dark:text-gray-400">Export all collections to file</p></div></div> <button${attr('disabled', loading, true)} class="preset-outline-secondary-500 btn mt-4 w-full">Export Everything</button></div> <div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"><div class="mb-4 flex items-center"><div class="preset-filled-primary-500 btn-icon mr-3"><iconify-icon icon="mdi:folder-multiple" width="24"></iconify-icon></div> <div><h3 class="font-semibold text-gray-900 dark:text-white">Collections</h3> <p class="text-sm text-gray-600 dark:text-gray-400"><span class="font-semibold text-tertiary-500 dark:text-primary-500">${escape_html(collections.length)}</span> collections available</p></div></div> <div class="space-y-2"><!--[-->`
			);
			const each_array = ensure_array_like(collections.slice(0, 3));
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let collection = each_array[$$index];
				$$renderer3.push(
					`<div class="flex items-center justify-between text-sm"><span class="text-tertiary-500 dark:text-primary-500">${escape_html(collection.label)}</span> <iconify-icon icon="mdi:chevron-right" width="24"></iconify-icon></div>`
				);
			}
			$$renderer3.push(`<!--]--> `);
			if (collections.length > 3) {
				$$renderer3.push('<!--[-->');
				$$renderer3.push(`<p class="text-xs text-surface-300">...and ${escape_html(collections.length - 3)} more</p>`);
			} else {
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]--></div></div></div> `);
			{
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]--> `);
			{
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]--></div> `);
			{
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]--> `);
			{
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]--> `);
			{
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]-->`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer2.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer2.subsume($$inner_renderer);
	});
}
function _page($$renderer) {
	head('gnwqyg', $$renderer, ($$renderer2) => {
		$$renderer2.title(($$renderer3) => {
			$$renderer3.push(`<title>Import &amp; Export - SveltyCMS</title>`);
		});
		$$renderer2.push(`<meta name="description" content="Import and export your collections data for backup and migration purposes."/>`);
	});
	$$renderer.push(`<header class="mb-6">`);
	PageTitle($$renderer, {
		name: 'Import & Export',
		icon: 'mdi:database-import',
		showBackButton: true,
		backUrl: '/config'
	});
	$$renderer.push(
		`<!----> <div class="mt-4 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20"><div class="flex items-start space-x-3"><iconify-icon icon="mdi:information" width="24" class="mt-1 text-tertiary-500 dark:text-primary-500"></iconify-icon> <div><p class="mb-2 font-semibold">Data Management Tools:</p> <ul class="list-none space-y-1 text-sm"><li class="flex"><span class="w-24 font-semibold text-tertiary-500 dark:text-primary-500">Export:</span> <span>Create backups of your collections data in JSON or CSV format</span></li> <li class="flex"><span class="w-24 font-semibold text-tertiary-500 dark:text-primary-500">Import:</span> <span>Restore data from previous backups or migrate from other systems</span></li> <li class="flex"><span class="w-24 font-semibold text-tertiary-500 dark:text-primary-500">Security:</span> <span>All operations are performed server-side - your data never leaves your server</span></li> <li class="flex"><span class="w-24 font-semibold text-tertiary-500 dark:text-primary-500">Validation:</span> <span>Import process includes data validation and error reporting</span></li></ul></div></div></div></header>  <section class="rounded-lg bg-surface-50 p-6 shadow-sm dark:bg-surface-800">`
	);
	ImportExportManager($$renderer);
	$$renderer.push(`<!----></section>`);
}
export { _page as default };
//# sourceMappingURL=_page.svelte.js.map
