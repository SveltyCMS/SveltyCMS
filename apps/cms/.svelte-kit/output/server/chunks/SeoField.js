import { d as escape_html, a as attr, g as attr_class, i as clsx, h as bind_props } from './index5.js';
function SeoField($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let {
			id,
			label,
			value = void 0,
			placeholder = '',
			type = 'input',
			rows = 3,
			maxLength,
			optimalMin = 0,
			optimalMax = 999,
			translated = false,
			lang,
			translationPct = 0,
			field,
			onUpdate,
			icon
		} = $$props;
		const getLengthClass = () => {
			if (maxLength && value.length > maxLength) return 'text-error-500';
			if (value.length >= optimalMin && value.length <= optimalMax) return 'text-success-500';
			return 'text-surface-400';
		};
		$$renderer2.push(
			`<div class="space-y-2"><div class="flex items-center justify-between mb-1"><div class="flex items-center gap-2"><span class="font-bold text-sm">${escape_html(label)}</span> `
		);
		icon?.($$renderer2);
		$$renderer2.push(
			`<!----> <span class="text-surface-400 cursor-help"${attr('title', placeholder)}><iconify-icon icon="mdi:information-outline" width="16"></iconify-icon></span></div> <div class="flex items-center gap-3 text-xs"><button type="button" title="Insert Token"><iconify-icon icon="mdi:code-braces" width="16" class="font-bold text-tertiary-500 dark:text-primary-500"></iconify-icon></button> `
		);
		if (maxLength) {
			$$renderer2.push('<!--[-->');
			if (type === 'input') {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<span${attr_class(clsx(getLengthClass()))}>(${escape_html(value.length)}/${escape_html(maxLength)})</span>`);
			} else {
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(`<span${attr_class(clsx(getLengthClass()))}>(${escape_html(value.length)}/${escape_html(maxLength)})</span>`);
			}
			$$renderer2.push(`<!--]-->`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (translated) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="flex items-center gap-1 text-xs"><iconify-icon icon="bi:translate" width="16"></iconify-icon> <span class="font-medium text-tertiary-500 dark:text-primary-500">${escape_html(lang.toUpperCase())}</span> <span class="font-medium text-surface-400">(${escape_html(translationPct)}%)</span></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div></div> <div class="relative">`);
		if (type === 'textarea') {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<textarea${attr('id', id)} class="textarea pr-12 resize-y"${attr('rows', rows)}${attr('placeholder', placeholder)}>`);
			const $$body = escape_html(value);
			if ($$body) {
				$$renderer2.push(`${$$body}`);
			}
			$$renderer2.push(`</textarea>`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<input${attr('id', id)} type="text" class="input pr-12"${attr('placeholder', placeholder)}${attr('value', value)}/>`);
		}
		$$renderer2.push(`<!--]--></div></div>`);
		bind_props($$props, { value });
	});
}
export { SeoField as default };
//# sourceMappingURL=SeoField.js.map
