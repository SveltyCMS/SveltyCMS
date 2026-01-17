import { g as attr_class, e as ensure_array_like, a as attr, d as escape_html, h as bind_props } from './index5.js';
import './logger.js';
import './index7.js';
function Input($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { field, value = void 0, error } = $$props;
		let selectedFiles = [];
		$$renderer2.push(
			`<div${attr_class('min-h-[120px] rounded-lg border-2 border-dashed border-surface-300 p-4 dark:border-surface-600', void 0, { '!border-error-500': error })}>`
		);
		if (selectedFiles.length > 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<div class="mb-4 grid gap-4 [grid-cols-[repeat(auto-fill,minmax(100px,1fr))]"><!--[-->`);
			const each_array = ensure_array_like(selectedFiles);
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let file = each_array[$$index];
				$$renderer2.push(
					`<div class="relative overflow-hidden rounded border border-surface-200 dark:text-surface-50"><img${attr('src', file.thumbnailUrl)}${attr('alt', file.name)} class="h-[100px] w-full object-cover"/> <span class="block truncate p-1 text-center text-xs">${escape_html(file.name)}</span> <button class="absolute right-1 top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-none bg-surface-900/50 text-white transition-colors hover:bg-surface-900/75" aria-label="Remove">×</button></div>`
				);
			}
			$$renderer2.push(`<!--]--></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (field.multiupload || selectedFiles.length === 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<button type="button" class="w-full cursor-pointer rounded border-none bg-surface-100 p-3 transition-colors hover:bg-surface-200 dark:bg-surface-700 dark:hover:bg-surface-600">+ Add Media</button>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (error) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<p class="absolute -bottom-4 left-0 w-full text-center text-xs text-error-500" role="alert">${escape_html(error)}</p>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div>`);
		bind_props($$props, { value });
	});
}
export { Input as default };
//# sourceMappingURL=Input5.js.map
