import { a as attr, d as escape_html } from './index5.js';
function Display($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { value } = $$props;
		if (
			// Construct the embed URL and iframe HTML based on the platform.
			// Note: For now we just display thumbnail and metadata, embed logic available if needed
			value?.thumbnailUrl
		) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="flex w-full max-w-full items-center gap-2.5"${attr('title', value.title ?? '')}><img${attr('src', value.thumbnailUrl)}${attr('alt', value.title || 'Video thumbnail')} class="h-auto w-[60px] shrink-0 rounded-md object-cover" loading="lazy" decoding="async"/> <div class="flex min-w-0 flex-wrap items-center gap-x-2"><span class="max-w-48 truncate text-sm font-medium">${escape_html(value.title)}</span> `
			);
			if (value.duration) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<span class="shrink-0 text-xs text-gray-500">${escape_html(value.duration)}</span>`);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--></div></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<span class="text-gray-400">–</span>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
export { Display as default };
//# sourceMappingURL=Display14.js.map
