import { d as escape_html } from './index5.js';
import 'clsx';
import { S as Sanitize } from './Sanitize.js';
function Display($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { value } = $$props;
		if (value?.content) {
			$$renderer2.push('<!--[-->');
			if (value.title) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<h2>${escape_html(value.title)}</h2>`);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--> `);
			Sanitize($$renderer2, { html: value.content, profile: 'rich-text', class: 'prose' });
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<span>–</span>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
export { Display as default };
//# sourceMappingURL=Display10.js.map
