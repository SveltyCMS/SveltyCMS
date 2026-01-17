import { a as attr, d as escape_html, c as stringify } from './index5.js';
function Display($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { value } = $$props;
		const displayText = (() => {
			if (!value?.focusKeyword) return 'No SEO data';
			return `Keyword: ${value.focusKeyword}`;
		})();
		if (value) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="seo-display svelte-1m84ivt"${attr('title', `Title: ${stringify(value.title)} | Description: ${stringify(value.description)}`)}><iconify-icon icon="tabler:seo" class="icon svelte-1m84ivt"></iconify-icon> <span>${escape_html(displayText)}</span></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<span>–</span>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
export { Display as default };
//# sourceMappingURL=Display19.js.map
