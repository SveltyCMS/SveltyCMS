import { a as attr, b as attr_style, d as escape_html } from './index5.js';
function Display($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { value } = $$props;
		const isValidHex = (color) => {
			return /^#[0-9a-f]{6}$/i.test(color);
		};
		const safeColor = value && isValidHex(value) ? value : '#000000';
		if (value && isValidHex(value)) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="display-wrapper svelte-3l9hkh"${attr('title', value)}><div class="swatch-preview svelte-3l9hkh"${attr_style('', { 'background-color': safeColor })}></div> <span class="hex-code svelte-3l9hkh">${escape_html(value)}</span></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<span>–</span>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
export { Display as default };
//# sourceMappingURL=Display15.js.map
