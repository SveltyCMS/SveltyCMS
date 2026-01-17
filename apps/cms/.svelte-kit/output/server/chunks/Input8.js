import { g as attr_class, d as escape_html } from './index5.js';
import './runtime.js';
import { a as app } from './store.svelte.js';
function Input($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { field, value, error } = $$props;
		app.contentLanguage;
		const displayText = 'Select an Entry';
		$$renderer2.push(
			`<div${attr_class('relation-container', void 0, { invalid: error })}><div class="selection-box"><span>${escape_html(displayText)}</span> <div class="actions"><button aria-label="Select Entry">Select</button> `
		);
		if (value) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<button aria-label="Clear Selection">×</button>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div></div> `);
		if (error) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<p class="error-message" role="alert">${escape_html(error)}</p>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div>`);
	});
}
export { Input as default };
//# sourceMappingURL=Input8.js.map
