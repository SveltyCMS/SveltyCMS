import { d as escape_html } from './index5.js';
import 'clsx';
import { a as app } from './store.svelte.js';
function Display($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { value } = $$props;
		const lang = app.systemLanguage;
		const formattedNumber = (() => {
			if (typeof value !== 'number') return '–';
			try {
				return new Intl.NumberFormat(lang).format(value);
			} catch (e) {
				return 'Invalid Number';
			}
		})();
		$$renderer2.push(`<span>${escape_html(formattedNumber)}</span>`);
	});
}
export { Display as default };
//# sourceMappingURL=Display13.js.map
