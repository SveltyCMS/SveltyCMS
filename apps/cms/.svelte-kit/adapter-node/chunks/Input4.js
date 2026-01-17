import { a as attr, d as escape_html, g as attr_class, c as stringify, h as bind_props } from './index5.js';
import './logger.js';
import { b as createValidationSchema } from './scanner.js';
import { g as getFieldName } from './utils.js';
import { a as app, v as validationStore } from './store.svelte.js';
import { publicEnv } from './globalSettings.svelte.js';
function Input($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { field, value = void 0, validateOnChange = true, validateOnBlur = true, debounceMs = 300 } = $$props;
		const MAX_INPUT_LENGTH = 1e5;
		if (value && typeof value === 'string' && value.length > MAX_INPUT_LENGTH) {
			value = value.substring(0, MAX_INPUT_LENGTH);
		}
		const _language = field.translated ? app.contentLanguage : (publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en').toLowerCase();
		let safeValue = value?.[_language] ?? '';
		let count = safeValue?.length ?? 0;
		let fieldName = getFieldName(field);
		let validationError = validationStore.getError(fieldName);
		let isValidating = false;
		let badgeClass = () => {
			const length = count;
			if (field?.minLength && length < field?.minLength) return 'bg-error-500';
			if (field?.maxLength && length > field?.maxLength) return 'bg-error-500';
			if (field?.count && length === field?.count) return 'bg-success-500';
			if (field?.count && length > field?.count) return 'bg-warning-500';
			if (field?.minLength) return '!preset-filled-surface-500';
			return '!preset-outlined-surface-500';
		};
		createValidationSchema(field);
		const WidgetData = async () => value;
		$$renderer2.push(
			`<div class="relative mb-4 min-h-10 w-full pb-6"><div class="preset-filled-surface-500 btn-group flex w-full rounded" role="group">`
		);
		if (field?.prefix) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<button class="px-2!" type="button"${attr('aria-label', `${field.prefix} prefix`)}>${escape_html(field?.prefix)}</button>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--> <input type="text"${attr('value', safeValue)}${attr('name', field?.db_fieldName)}${attr('id', field?.db_fieldName)}${attr('placeholder', field?.placeholder && field?.placeholder !== '' ? field?.placeholder : field?.db_fieldName)}${attr('required', field?.required, true)}${attr('disabled', field?.disabled, true)}${attr('readonly', field?.readonly, true)}${attr('minlength', field?.minLength)}${attr('maxlength', field?.maxLength)}${attr_class(
				'input w-full flex-1 rounded-none text-black dark:text-primary-500',
				void 0,
				{
					'!border-error-500': !!validationError,
					'!ring-1': !!validationError || isValidating,
					'!ring-error-500': !!validationError,
					'!border-primary-500': isValidating,
					'!ring-primary-500': isValidating
				}
			)}${attr('aria-invalid', !!validationError)}${attr('aria-describedby', validationError ? `${fieldName}-error` : field.helper ? `${fieldName}-helper` : void 0)}${attr('aria-required', field?.required)} data-testid="text-input"/> `
		);
		if (field?.suffix || field?.count || field?.minLength || field?.maxLength) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<div class="flex items-center" role="status" aria-live="polite">`);
			if (field?.count || field?.minLength || field?.maxLength) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<span${attr_class(`badge mr-1 rounded-full ${stringify(badgeClass)}`)} aria-label="Character count">`);
				if (field?.count && field?.minLength && field?.maxLength) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`${escape_html(count)}/${escape_html(field?.maxLength)}`);
				} else {
					$$renderer2.push('<!--[!-->');
					if (field?.count && field?.maxLength) {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(`${escape_html(count)}/${escape_html(field?.maxLength)}`);
					} else {
						$$renderer2.push('<!--[!-->');
						if (field?.count && field?.minLength) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(`${escape_html(count)} => ${escape_html(field?.minLength)}`);
						} else {
							$$renderer2.push('<!--[!-->');
							if (field?.minLength && field?.maxLength) {
								$$renderer2.push('<!--[-->');
								$$renderer2.push(`${escape_html(count)} => ${escape_html(field?.minLength)}/${escape_html(field?.maxLength)}`);
							} else {
								$$renderer2.push('<!--[!-->');
								if (field?.count) {
									$$renderer2.push('<!--[-->');
									$$renderer2.push(`${escape_html(count)}/${escape_html(field?.count)}`);
								} else {
									$$renderer2.push('<!--[!-->');
									if (field?.maxLength) {
										$$renderer2.push('<!--[-->');
										$$renderer2.push(`${escape_html(count)}/${escape_html(field?.maxLength)}`);
									} else {
										$$renderer2.push('<!--[!-->');
										if (field?.minLength) {
											$$renderer2.push('<!--[-->');
											$$renderer2.push(`min ${escape_html(field?.minLength)}`);
										} else {
											$$renderer2.push('<!--[!-->');
										}
										$$renderer2.push(`<!--]-->`);
									}
									$$renderer2.push(`<!--]-->`);
								}
								$$renderer2.push(`<!--]-->`);
							}
							$$renderer2.push(`<!--]-->`);
						}
						$$renderer2.push(`<!--]-->`);
					}
					$$renderer2.push(`<!--]-->`);
				}
				$$renderer2.push(`<!--]--></span>`);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--> `);
			if (field?.suffix) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<span class="px-1!"${attr('aria-label', `${field.suffix} suffix`)}>${escape_html(field?.suffix)}</span>`);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div> `);
		if (field.helper) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<p${attr('id', `${fieldName}-helper`)} class="absolute bottom-0 left-0 w-full text-center text-xs text-surface-500 dark:text-surface-50">${escape_html(field.helper)}</p>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (validationError) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<p${attr('id', `${fieldName}-error`)} class="absolute -bottom-4 left-0 w-full text-center text-xs text-error-500" role="alert" aria-live="polite">${escape_html(validationError)}</p>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div>`);
		bind_props($$props, { value, WidgetData });
	});
}
export { Input as default };
//# sourceMappingURL=Input4.js.map
