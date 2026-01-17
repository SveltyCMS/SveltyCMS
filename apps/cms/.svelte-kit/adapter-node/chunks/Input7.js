import { a as attr, d as escape_html, e as ensure_array_like, g as attr_class, b as attr_style, i as clsx, h as bind_props } from './index5.js';
function Input($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { field, value = void 0, error } = $$props;
		const fieldId = field.db_fieldName;
		$$renderer2.push(
			`<div class="mb-4"><fieldset${attr('id', fieldId)} class="rounded border border-surface-500 px-2 py-1 dark:border-surface-400"${attr('aria-describedby', error ? `${fieldId}-error` : void 0)}><legend class="mx-auto block w-fit px-2 text-center text-sm font-normal text-surface-700 dark:text-surface-300" style="background:none;border:none;">${escape_html(field.legend || 'Select one option')}</legend> <div class="flex flex-col gap-y-2"><!--[-->`
		);
		const each_array = ensure_array_like(field.options || []);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let option = each_array[$$index];
			$$renderer2.push(
				`<label class="flex cursor-pointer items-center gap-2 text-base text-surface-800 dark:text-surface-200"><input type="radio"${attr('name', field.db_fieldName)}${attr('checked', value === option.value, true)}${attr('value', option.value)}${attr('aria-checked', value === option.value)}${attr('aria-label', option.label)}${attr_class(clsx(field.color ? `accent-${field.color}` : ''))}${attr_style(field.color ? `accent-color: ${field.color}` : '')}/> <span>${escape_html(option.label)}</span></label>`
			);
		}
		$$renderer2.push(`<!--]--></div></fieldset> `);
		if (error) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<p${attr('id', `${fieldId}-error`)} class="mt-2 text-center text-xs text-error-500" role="alert">${escape_html(error)}</p>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div>`);
		bind_props($$props, { value });
	});
}
export { Input as default };
//# sourceMappingURL=Input7.js.map
