import { h as bind_props, g as attr_class, a as attr, c as stringify } from './index5.js';
function ColorSelector($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { color = '', show = true, key = 'color-selector', active = '', onChange } = $$props;
		let expanded = false;
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			$$renderer3.push(
				`<div${attr_class('wrapper svelte-1eh7a52', void 0, { hidden: !show })}><button type="button" aria-label="Select color"${attr('aria-expanded', expanded)}${attr('aria-controls', `color-palette-${stringify(key)}`)}${attr_class('selected btn-sm arrow svelte-1eh7a52', void 0, { arrow_up: expanded })}><iconify-icon icon="fluent-mdl2:color-solid" width="20"></iconify-icon></button> `
			);
			{
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]--></div>`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer2.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer2.subsume($$inner_renderer);
		bind_props($$props, { color, active });
	});
}
export { ColorSelector as default };
//# sourceMappingURL=ColorSelector.js.map
