import { g as attr_class, h as bind_props } from './index5.js';
function ImageDescription($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { show = false, value: propValue = '', key = '', active = '', onSubmit } = $$props;
		$$renderer2.push(
			`<div${attr_class('relative', void 0, { hidden: !show })}><button aria-label="Description" class="btn-sm flex items-center"><iconify-icon icon="material-symbols:description" width="20"></iconify-icon> <span class="hidden sm:inline">Description</span></button> `
		);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div>`);
		bind_props($$props, { active });
	});
}
export { ImageDescription as default };
//# sourceMappingURL=ImageDescription.js.map
