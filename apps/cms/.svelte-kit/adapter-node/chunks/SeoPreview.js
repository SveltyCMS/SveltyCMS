import { g as attr_class, d as escape_html, c as stringify } from './index5.js';
import { J as widget_seo_powerwords } from './_index.js';
import { publicEnv } from './globalSettings.svelte.js';
function SeoPreview($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		new Set(
			widget_seo_powerwords
				? widget_seo_powerwords()
						.split(',')
						.map((w) => w.trim().toLowerCase())
				: []
		);
		const { title, description, hostUrl, keywords = [], SeoPreviewToggle, ontogglePreview = () => {} } = $$props;
		$$renderer2.push(
			`<div class="mt-4 border-t border-surface-500 pt-4 dark:text-surface-50"><div class="mb-4 flex flex-wrap items-center justify-between gap-4"><h3 class="h3">SEO Preview</h3> <div class="flex items-center gap-2"><div class="preset-filled-surface-500 btn-group [&amp;>*+*]:border-surface-500"><button type="button"${attr_class(`${stringify(!SeoPreviewToggle ? 'preset-filled-primary-500' : '')} btn-sm`)} title="Desktop View"><iconify-icon icon="mdi:monitor" width="18"></iconify-icon></button> <button type="button"${attr_class(`${stringify(SeoPreviewToggle ? 'preset-filled-primary-500' : '')} btn-sm`)} title="Mobile View"><iconify-icon icon="mdi:cellphone" width="18"></iconify-icon></button></div> <button type="button"${attr_class(`btn-sm ${stringify('preset-filled-surface-500')}`)} title="Toggle Heatmap Visualization"><iconify-icon icon="mdi:fire" width="18" class="mr-1"></iconify-icon> Heatmap</button></div></div> <div${attr_class(`card variant-glass-surface p-4 transition-all duration-200 ${stringify(SeoPreviewToggle ? 'max-w-[375px] mx-auto' : 'w-full')}`)}><div class="mb-1 flex items-center gap-2 text-xs text-surface-500 dark:text-surface-50"><div class="flex h-6 w-6 items-center justify-center rounded-full bg-surface-200 dark:bg-surface-700"><iconify-icon icon="mdi:earth" width="14" class="text-surface-700 dark:text-surface-300"></iconify-icon></div> <div class="flex flex-col leading-none"><span class="font-bold text-surface-700 dark:text-surface-300">${escape_html(publicEnv.HOST_PROD || 'Your Site')}</span> <span class="truncate text-[10px]">${escape_html(hostUrl)}</span></div> <iconify-icon icon="mdi:dots-vertical" class="ml-auto"></iconify-icon></div> <div class="mb-1">`
		);
		{
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(
				`<h3 class="text-lg font-medium leading-tight text-primary-500 hover:underline dark:text-primary-400">${escape_html(title || 'Page Title')}</h3>`
			);
		}
		$$renderer2.push(`<!--]--></div> <div>`);
		{
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(
				`<p class="text-sm leading-normal text-surface-600 dark:text-surface-300">${escape_html(description || 'Page description goes here...')}</p>`
			);
		}
		$$renderer2.push(`<!--]--></div></div> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div>`);
	});
}
export { SeoPreview as default };
//# sourceMappingURL=SeoPreview.js.map
