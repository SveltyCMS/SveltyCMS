import { a as attr, d as escape_html } from './index5.js';
function Display($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { value } = $$props;
		const formattedAddress = (() => {
			if (!value?.street) return '–';
			const parts = [`${value.street} ${value.houseNumber}`, `${value.postalCode} ${value.city}`, value.country];
			return parts.filter(Boolean).join(', ');
		})();
		$$renderer2.push(`<span${attr('title', formattedAddress)}>${escape_html(formattedAddress)}</span>`);
	});
}
export { Display as default };
//# sourceMappingURL=Display11.js.map
