import { a as attr, d as escape_html, g as attr_class } from './index5.js';
import { a as app } from './store.svelte.js';
function Input($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { field, value, error } = $$props;
		const lang = app.systemLanguage;
		new Intl.NumberFormat(lang, { style: 'currency', currency: field.currencyCode || 'EUR' });
		let formattedValue = '';
		$$renderer2.push(`<div class="input-container relative mb-4"><div class="preset-filled-surface-500 btn-group flex w-full rounded" role="group">`);
		if (field?.prefix) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<button class="px-2!" type="button"${attr('aria-label', `${field.prefix} prefix`)}>${escape_html(field?.prefix)}</button>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--> <div class="relative w-full flex-1"><input type="text"${attr('value', formattedValue)}${attr('name', field?.db_fieldName)}${attr('id', field?.db_fieldName)}${attr('placeholder', typeof field?.placeholder === 'string' && field.placeholder !== '' ? field.placeholder : String(field?.db_fieldName ?? ''))}${attr('required', field?.required, true)}${attr('readonly', field?.readonly, true)}${attr('disabled', field?.disabled, true)}${attr_class(
				'input w-full rounded-none text-black dark:text-primary-500',
				void 0,
				{
					'!border-error-500': !!error,
					'!ring-1': !!error,
					'!ring-error-500': !!error
				}
			)}${attr('aria-invalid', !!error)}${attr('aria-describedby', error ? `${field.db_fieldName}-error` : void 0)}${attr('aria-required', field?.required)} data-testid="currency-input"/></div> `
		);
		if (field?.suffix) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<button class="px-2!" type="button"${attr('aria-label', `${field.suffix} suffix`)}>${escape_html(field?.suffix)}</button>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div> `);
		if (error) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<p${attr('id', `${field.db_fieldName}-error`)} class="absolute bottom-0 left-0 w-full text-center text-xs text-error-500" role="alert" aria-live="polite">${escape_html(error)}</p>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div>`);
	});
}
export { Input as default };
//# sourceMappingURL=Input10.js.map
