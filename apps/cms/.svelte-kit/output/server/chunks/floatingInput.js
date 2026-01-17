import { a as attr, f as attributes, c as stringify, g as attr_class, b as attr_style, d as escape_html, h as bind_props } from './index5.js';
function FloatingInput($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let {
			value = '',
			showPassword = false,
			disabled = false,
			icon = '',
			iconColor = 'gray',
			inputClass = '',
			label = '',
			labelClass = '',
			minlength,
			maxlength,
			name = '',
			required = false,
			passwordIconColor = 'gray',
			textColor = 'black',
			type = 'text',
			tabindex = 0,
			id = '',
			autocomplete,
			autocapitalize = 'none',
			spellcheck = false,
			autofocus = false,
			invalid = false,
			errorMessage = '',
			onClick,
			onInput,
			onkeydown,
			onPaste,
			$$slots,
			$$events,
			...rest
		} = $$props;
		const currentId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : 'defaultInputId');
		const errorId = errorMessage ? `error-${currentId}` : void 0;
		const effectiveType = showPassword && type === 'password' ? 'text' : type;
		const isTextColorClass = textColor.includes('text-') || textColor.includes(' ');
		$$renderer2.push(
			`<div class="relative w-full"><div class="group relative flex w-full items-center" role="group"${attr('aria-labelledby', currentId)}><input${attributes(
				{
					value,
					name,
					minlength,
					maxlength,
					disabled,
					tabindex,
					autocomplete: autocomplete ?? void 0,
					autocapitalize,
					spellcheck,
					'aria-required': required,
					'aria-invalid': invalid,
					'aria-describedby': errorId,
					type: effectiveType,
					style: !isTextColorClass && textColor ? `color: ${textColor};` : '',
					class: `peer block h-12 w-full appearance-none border-0 border-b-2 border-surface-300 bg-transparent pl-8 pr-6 pb-1 pt-5 text-base focus:border-tertiary-600 focus:outline-none focus:ring-0 disabled:opacity-50 dark:border-surface-400 dark:focus:border-tertiary-500 ${stringify(inputClass)} ${stringify(isTextColorClass ? textColor : '')}`,
					placeholder: ' ',
					id: currentId,
					...rest
				},
				void 0,
				{
					'!border-error-500': invalid,
					'dark:!border-error-500': invalid,
					'pr-10': type === 'password'
				},
				void 0,
				4
			)}/> `
		);
		if (icon) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<iconify-icon${attr('icon', icon)} width="1.125em"${attr_class('absolute left-0 top-3', void 0, {
					'text-surface-500': iconColor === 'gray',
					'dark:text-surface-50': iconColor === 'gray'
				})}${attr_style(iconColor !== 'gray' ? `color: ${iconColor};` : '')} aria-hidden="true"></iconify-icon>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (type === 'password') {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<iconify-icon tabindex="0" role="button"${attr('icon', showPassword ? 'bi:eye-fill' : 'bi:eye-slash-fill')}${attr('aria-label', showPassword ? 'Hide password' : 'Show password')}${attr('aria-pressed', showPassword)} class="absolute right-2 top-3 cursor-pointer hover:opacity-75 focus:outline-none text-surface-500 dark:text-surface-50" width="24"${attr_style(passwordIconColor !== 'gray' ? `color: ${passwordIconColor};` : '')}></iconify-icon>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (label) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<label${attr('for', currentId)}${attr_style(!isTextColorClass && textColor ? `color: ${textColor};` : '')}${attr_class(`pointer-events-none absolute left-8 top-1.5 origin-left -translate-y-3 scale-75 transform text-base text-surface-500 transition-all duration-200 ease-in-out peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:text-base peer-focus:-translate-y-3 peer-focus:scale-75 peer-focus:text-tertiary-500! peer-disabled:text-surface-500 ${stringify(value ? `-translate-y-3 scale-75 ${invalid ? 'text-error-500!' : 'text-tertiary-500!'}` : '')} ${stringify(isTextColorClass ? textColor : '')} ${stringify(labelClass)}`)}>${escape_html(label)} `
			);
			if (required) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<span class="text-error-500" aria-hidden="true">*</span>`);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--></label>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div> `);
		if (invalid && errorMessage) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<p${attr('id', errorId)} class="mt-1 text-xs text-error-500" role="alert">${escape_html(errorMessage)}</p>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div>`);
		bind_props($$props, { value, showPassword });
	});
}
export { FloatingInput as F };
//# sourceMappingURL=floatingInput.js.map
