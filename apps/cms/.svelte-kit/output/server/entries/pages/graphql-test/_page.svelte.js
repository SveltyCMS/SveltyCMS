import { e as ensure_array_like, d as escape_html } from '../../../chunks/index5.js';
import '../../../chunks/logger.js';
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let posts = [];
		$$renderer2.push(`<h1>GraphQL Subscription Test</h1> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> <h2>New Posts:</h2> <ul><!--[-->`);
		const each_array = ensure_array_like(posts);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let post = each_array[$$index];
			$$renderer2.push(`<li>${escape_html(post.title)} (${escape_html(post._id)})</li>`);
		}
		$$renderer2.push(`<!--]--></ul>`);
	});
}
export { _page as default };
//# sourceMappingURL=_page.svelte.js.map
