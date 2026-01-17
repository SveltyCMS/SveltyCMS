import { a as attr, d as escape_html, g as attr_class, h as bind_props } from './index5.js';
import { o as onDestroy } from './index-server.js';
import { publicEnv } from './globalSettings.svelte.js';
import { a as app, v as validationStore } from './store.svelte.js';
import './collectionStore.svelte.js';
import { g as getFieldName } from './utils.js';
import { pipe, string, minLength, email, optional } from 'valibot';
function Input($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { field, value = void 0 } = $$props;
		const fieldName = getFieldName(field);
		const _language = field.translated ? app.contentLanguage : (publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en').toLowerCase();
		const safeValue = value?.[_language] ?? '';
		const validationError = validationStore.getError(fieldName);
		let isValidating = false;
		field?.required
			? pipe(string(), minLength(1, 'This field is required'), email('Please enter a valid email address'))
			: optional(pipe(string(), email('Please enter a valid email address')), '');
		onDestroy(() => {});
		const WidgetData = async () => value;
		$$renderer2.push(`<div class="input-container relative mb-4"><div class="preset-filled-surface-500 btn-group flex w-full rounded" role="group">`);
		if (field?.prefix) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<button class="px-2!" type="button"${attr('aria-label', `${field.prefix} prefix`)}>${escape_html(field?.prefix)}</button>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--> <div class="relative w-full flex-1"><input type="email"${attr('value', safeValue || '')}${attr('name', field?.db_fieldName)}${attr('id', field?.db_fieldName)}${attr('placeholder', typeof field?.placeholder === 'string' && field.placeholder !== '' ? field.placeholder : String(field?.db_fieldName ?? ''))}${attr('required', field?.required, true)}${attr('readonly', field?.readonly, true)}${attr('disabled', field?.disabled, true)}${attr_class(
				'input w-full rounded-none text-black dark:text-primary-500',
				void 0,
				{
					'!border-error-500': !!validationError,
					'!ring-1': !!validationError || isValidating,
					'!ring-error-500': !!validationError,
					'!border-primary-500': isValidating,
					'!ring-primary-500': isValidating
				}
			)}${attr('aria-invalid', !!validationError)}${attr('aria-describedby', validationError ? `${fieldName}-error` : void 0)}${attr('aria-required', field?.required)} data-testid="email-input"/></div> `
		);
		if (field?.suffix) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<button class="px-2!" type="button"${attr('aria-label', `${field.suffix} suffix`)}>${escape_html(field?.suffix)}</button>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div></div>`);
		bind_props($$props, { value, WidgetData });
	});
}
export { Input as default };
//# sourceMappingURL=Input11.js.map
