import { e as ensure_array_like, g as attr_class, d as escape_html, a as attr, i as clsx } from '../../../../chunks/index5.js';
import '../../../../chunks/store.svelte.js';
import '../../../../chunks/logger.js';
import { P as PageTitle } from '../../../../chunks/PageTitle.js';
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let isLoading = true;
		let activeTab = 'sync';
		PageTitle($$renderer2, {
			name: 'Configuration Manager',
			icon: 'mdi:sync-circle',
			showBackButton: true,
			backUrl: '/config'
		});
		$$renderer2.push(`<!----> <div class="wrapper"><div class="preset-tonal-surface mb-4 p-4"><p class="text-surface-600 dark:text-surface-300">This tool manages the synchronization between configuration defined in the filesystem (the "source of truth") and the configuration active in
			the database. Use it to deploy structural changes between different environments (e.g., from development to live).</p></div> <div class="flex w-full overflow-x-auto border border-surface-300 bg-surface-100/70 dark:text-surface-50 dark:bg-surface-800/70"><!--[-->`);
		const each_array = ensure_array_like(['sync', 'import', 'export', 'debug']);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let tab = each_array[$$index];
			$$renderer2.push(`<!---->`);
			{
				$$renderer2.push(
					`<button${attr_class('flex-1 py-3 text-center text-sm font-medium transition-all duration-200', void 0, {
						'!bg-tertiary-500': activeTab === tab,
						'!text-white': activeTab === tab,
						'!dark:bg-primary-500': activeTab === tab,
						'!dark:text-surface-900': activeTab === tab,
						'dark:text-surface-200': activeTab !== tab,
						'text-surface-700': activeTab !== tab
					})}>${escape_html(tab.charAt(0).toUpperCase() + tab.slice(1))}</button>`
				);
			}
			$$renderer2.push(`<!---->`);
		}
		$$renderer2.push(`<!--]--></div> <section>`);
		{
			$$renderer2.push('<!--[-->');
			{
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(
				`<!--]--> <div class="my-4"><button class="preset-filled-tertiary-500 btn w-full dark:preset-filled-primary-500 sm:w-auto"${attr('disabled', true, true)}><iconify-icon icon="mdi:sync"${attr_class(clsx(''))}></iconify-icon> ${escape_html('Sync All Changes')}</button></div> `
			);
			{
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<div class="flex animate-pulse flex-col items-center py-12 text-surface-500"><iconify-icon icon="mdi:sync" class="mb-3 animate-spin text-5xl"></iconify-icon> Checking synchronization status... <button class="preset-filled-tertiary-500 btn mt-6 flex items-center gap-2 dark:preset-filled-primary-500"${attr('disabled', isLoading, true)}><iconify-icon icon="mdi:refresh"${attr_class(clsx('animate-spin'))}></iconify-icon> ${escape_html('Checking...')}</button></div>`
				);
			}
			$$renderer2.push(`<!--]-->`);
		}
		$$renderer2.push(`<!--]--> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></section></div>`);
	});
}
export { _page as default };
//# sourceMappingURL=_page.svelte.js.map
