import { e as ensure_array_like, a as attr } from './index5.js';
function Display($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { value } = $$props;
		let files = [];
		$$renderer2.push(`<div class="flex items-center justify-center gap-1 p-0.5">`);
		if (
			// Fetch media data when the value prop changes.
			// In a real app, this would use the same shared fetch function as Input.svelte
			files.length > 0
		) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<!--[-->`);
			const each_array = ensure_array_like(files);
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let file = each_array[$$index];
				$$renderer2.push(
					`<img${attr('src', file.thumbnailUrl)}${attr('alt', file.name)}${attr('title', file.name)} class="h-8 w-8 rounded border border-surface-200 object-cover dark:text-surface-50"/>`
				);
			}
			$$renderer2.push(`<!--]-->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<span>–</span>`);
		}
		$$renderer2.push(`<!--]--></div>`);
	});
}
export { Display as default };
//# sourceMappingURL=Display6.js.map
