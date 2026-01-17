import { d as escape_html } from './index5.js';
import 'clsx';
function Display($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { value } = $$props;
		let displayText = 'Loading...';
		$$renderer2.push(
			`<span>${escape_html(
				// Fetch the entry's display text when the ID `value` changes.
				// API Call: GET /api/entries/{field.collection}/{value}?fields={field.displayField}
				// This is a more optimized fetch for just the field we need.
				displayText
			)}</span>`
		);
	});
}
export { Display as default };
//# sourceMappingURL=Display9.js.map
