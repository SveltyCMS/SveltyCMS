import { g as attr_class, i as clsx } from './index5.js';
function Sanitize($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { html: html$1, profile = 'default', class: className } = $$props;
		{
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<div${attr_class(clsx(className), 'svelte-u2dqrz')} data-sanitize-loading=""></div>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
export { Sanitize as S };
//# sourceMappingURL=Sanitize.js.map
