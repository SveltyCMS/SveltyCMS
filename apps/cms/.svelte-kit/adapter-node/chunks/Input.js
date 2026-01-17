import { a as attr, d as escape_html, g as attr_class, b as attr_style, h as bind_props } from './index5.js';
import './store.svelte.js';
import { g as getFieldName } from './utils.js';
function Input($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { field, value = void 0 } = $$props;
		getFieldName(field);
		$$renderer2.push(
			`<div class="mb-4"><fieldset${attr('id', field.db_fieldName)} class="rounded border border-surface-500 p-2 dark:border-surface-400"${attr('aria-describedby', field.helper ? `${field.db_fieldName}-helper` : void 0)}><legend class="mx-auto block w-fit px-2 text-center text-sm font-normal text-surface-700 dark:text-surface-300" style="background:none;border:none;">${escape_html(field.legend || 'Select one option')}</legend> <div class="flex flex-col gap-y-2"><label class="flex cursor-pointer items-center gap-2 text-base text-surface-800 dark:text-surface-200"><input type="checkbox"${attr('name', field.db_fieldName)}${attr('required', field.required, true)}${attr('checked', !!value, true)}${attr_class(`h-5 w-5 cursor-pointer rounded border-gray-300 transition-colors duration-200 focus:ring-2 focus:ring-offset-2 ${field.color ? `accent-${field.color}` : ''} ${field.size === 'sm' ? 'h-4 w-4' : field.size === 'lg' ? 'h-6 w-6' : ''}`)}${attr('aria-label', field.label)}${attr('aria-describedby', field.helper ? `${field.db_fieldName}-helper` : void 0)}${attr_style(field.color ? `accent-color: ${field.color}` : '')}/> <span>${escape_html(field.label)}</span></label></div> `
		);
		if (field.helper) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<div${attr('id', `${field.db_fieldName}-helper`)} class="mt-2 text-xs text-gray-500">${escape_html(field.helper)}</div>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></fieldset></div>`);
		bind_props($$props, { value });
	});
}
export { Input as default };
//# sourceMappingURL=Input.js.map
