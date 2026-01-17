import { d as escape_html } from './index5.js';
import 'clsx';
import { a as app } from './store.svelte.js';
function Display($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { field, value } = $$props;
		const lang = app.systemLanguage;
		const formattedCurrency = (() => {
			if (typeof value !== 'number') return '–';
			try {
				return new Intl.NumberFormat(lang, { style: 'currency', currency: field.currencyCode || 'EUR' }).format(value);
			} catch (e) {
				return 'Invalid amount';
			}
		})();
		$$renderer2.push(`<span>${escape_html(formattedCurrency)}</span>`);
	});
}
export { Display as default };
//# sourceMappingURL=Display12.js.map
