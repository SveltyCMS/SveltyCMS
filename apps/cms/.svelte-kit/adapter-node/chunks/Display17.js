import { a as attr, d as escape_html, c as stringify } from './index5.js';
function Display($$renderer, $$props) {
	const { value } = $$props;
	if (value) {
		$$renderer.push('<!--[-->');
		$$renderer.push(
			`<a${attr('href', `tel:${stringify(value)}`)} class="tel-link svelte-mbvr15"${attr('title', `Call ${stringify(value)}`)}>${escape_html(value)}</a>`
		);
	} else {
		$$renderer.push('<!--[!-->');
		$$renderer.push(`<span>–</span>`);
	}
	$$renderer.push(`<!--]-->`);
}
export { Display as default };
//# sourceMappingURL=Display17.js.map
