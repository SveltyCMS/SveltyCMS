import { d as escape_html } from './index5.js';
import 'clsx';
function Display($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { field, value } = $$props;
		const displayLabel = (() => {
			if (value === null || value === void 0) return '–';
			const selectedOption = field.options?.find((opt) => opt.value === value);
			return selectedOption?.label || String(value);
		})();
		$$renderer2.push(`<div>`);
		if (field.ledgent) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<div class="mb-1 text-base font-normal text-surface-700">${escape_html(field.ledgent)}</div>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> <span>${escape_html(displayLabel)}</span></div>`);
	});
}
export { Display as default };
//# sourceMappingURL=Display8.js.map
