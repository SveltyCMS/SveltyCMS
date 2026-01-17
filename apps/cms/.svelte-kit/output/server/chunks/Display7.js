import { e as ensure_array_like } from './index5.js';
import { a as app } from './store.svelte.js';
import { S as Sanitize } from './Sanitize.js';
function Display_1($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { value } = $$props;
		const lang = app.contentLanguage;
		if (value && value.length > 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<ul class="menu-display-list list-none pl-4"><!--[-->`);
			const each_array = ensure_array_like(value);
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let item = each_array[$$index];
				$$renderer2.push(`<li>`);
				Sanitize($$renderer2, {
					html: item._fields?.title?.[lang] || 'Untitled',
					profile: 'strict'
				});
				$$renderer2.push(`<!----> `);
				if (item.children.length > 0) {
					$$renderer2.push('<!--[-->');
					Display_1($$renderer2, { value: item.children });
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--></li>`);
			}
			$$renderer2.push(`<!--]--></ul>`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<span>–</span>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
export { Display_1 as default };
//# sourceMappingURL=Display7.js.map
