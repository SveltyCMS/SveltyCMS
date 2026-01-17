import { a as attr, c as stringify, e as ensure_array_like } from './index5.js';
function Display($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { field, value } = $$props;
		const stars = (() => Array(field.max || 5).fill(0))();
		if (typeof value === 'number' && value > 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="display-wrapper svelte-7l66vd"${attr('title', `${stringify(value)} out of ${stringify(field.max || 5)} stars`)}><!--[-->`
			);
			const each_array = ensure_array_like(stars);
			for (let i = 0, $$length = each_array.length; i < $$length; i++) {
				each_array[i];
				if (i < value) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`<iconify-icon${attr('icon', field.iconFull || 'material-symbols:star')} class="text-warning-500"></iconify-icon>`);
				} else {
					$$renderer2.push('<!--[!-->');
					$$renderer2.push(`<iconify-icon${attr('icon', field.iconEmpty || 'material-symbols:star-outline')} class="text-gray-300"></iconify-icon>`);
				}
				$$renderer2.push(`<!--]-->`);
			}
			$$renderer2.push(`<!--]--></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<span>–</span>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
export { Display as default };
//# sourceMappingURL=Display18.js.map
