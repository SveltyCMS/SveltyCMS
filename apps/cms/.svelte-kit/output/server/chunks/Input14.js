import { a as attr, d as escape_html, g as attr_class, h as bind_props } from './index5.js';
import { g as getFieldName } from './utils.js';
import './store.svelte.js';
function Input($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { field, value = void 0, error } = $$props;
		getFieldName(field);
		const inputValue = (() => {
			if (!value) return '';
			try {
				return value.substring(0, 10);
			} catch {
				return '';
			}
		})();
		const minDate = (() => {
			if (!field.minDate) return void 0;
			try {
				return new Date(field.minDate).toISOString().substring(0, 10);
			} catch {
				return void 0;
			}
		})();
		const maxDate = (() => {
			if (!field.maxDate) return void 0;
			try {
				return new Date(field.maxDate).toISOString().substring(0, 10);
			} catch {
				return void 0;
			}
		})();
		$$renderer2.push(
			`<div class="relative space-y-1"><label${attr('for', field.db_fieldName)} class="sr-only svelte-jb5xv8">${escape_html(field.label)} `
		);
		if (field.required) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<span>(required)</span>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--></label> <div class="relative w-full"><input type="date"${attr('id', field.db_fieldName)}${attr('name', field.db_fieldName)}${attr('required', field.required, true)}${attr('value', inputValue)}${attr('min', minDate)}${attr('max', maxDate)}${attr_class('input', void 0, { invalid: error })}${attr('aria-invalid', !!error)}${attr('aria-describedby', error ? `${field.db_fieldName}-error` : field.helper ? `${field.db_fieldName}-helper` : void 0)}${attr('aria-required', field.required)} data-testid="date-input"/></div> `
		);
		if (field.helper && !error) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<p${attr('id', `${field.db_fieldName}-helper`)} class="text-xs text-gray-600 dark:text-gray-400">${escape_html(field.helper)}</p>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (error) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<p${attr('id', `${field.db_fieldName}-error`)} class="text-xs text-error-500" role="alert" aria-live="polite">${escape_html(error)}</p>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div>`);
		bind_props($$props, { value });
	});
}
export { Input as default };
//# sourceMappingURL=Input14.js.map
