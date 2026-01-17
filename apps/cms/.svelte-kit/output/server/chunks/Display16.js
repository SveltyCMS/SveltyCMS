import { a as attr, d as escape_html, c as stringify } from './index5.js';
function Display($$renderer, $$props) {
	const { value } = $$props;
	if (value) {
		$$renderer.push('<!--[-->');
		$$renderer.push(
			`<a${attr('href', `mailto:${stringify(value)}`)} class="email-link svelte-1yn2yb4"${attr('title', `Send email to ${stringify(value)}`)}>${escape_html(value)}</a>`
		);
	} else {
		$$renderer.push('<!--[!-->');
		$$renderer.push(`<span>–</span>`);
	}
	$$renderer.push(`<!--]-->`);
}
export { Display as default };
//# sourceMappingURL=Display16.js.map
