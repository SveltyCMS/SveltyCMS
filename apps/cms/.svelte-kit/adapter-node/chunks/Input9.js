import { g as attr_class, a as attr, d as escape_html } from './index5.js';
import { I as colorpicker_hex1 } from './_index.js';
function Input($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { field, value, error } = $$props;
		$$renderer2.push(
			`<div${attr_class('relative rounded p-1', void 0, {
				invalid:
					// If the value is initially null, undefined, or empty, default it to black.
					error
			})}><div class="flex items-center rounded gap-0.5 border border-surface-400 pr-1"><input type="color"${attr('id', field.db_fieldName)}${attr('name', field.db_fieldName)}${attr('value', value)} class="pl-2 h-9 w-9 shrink-0 cursor-pointer border-none bg-transparent p-0" aria-label="Color Picker"/> <div class="relative grow"><input type="text"${attr('value', value)}${attr('placeholder', colorpicker_hex1())} class="w-full grow border-none bg-transparent font-mono outline-none focus:ring-0" aria-label="Hex Color Value"/></div></div> `
		);
		if (error) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<p class="absolute bottom-0 left-0 w-full text-center text-xs text-error-500" role="alert">${escape_html(error)}</p>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div>`);
	});
}
export { Input as default };
//# sourceMappingURL=Input9.js.map
