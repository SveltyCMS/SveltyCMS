import 'clsx';
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { data } = $$props;
		const emailList = { ...data, path: data.path ?? null };
		if (emailList.files && emailList.files.length) {
			$$renderer2.push('<!--[-->');
			{
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]-->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(
				`<div class="p-8 text-center text-gray-500"><p>No email templates found in <code class="rounded bg-gray-100 px-1 py-0.5">/src/components/emails</code>.</p></div>`
			);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
export { _page as default };
//# sourceMappingURL=_page.svelte.js.map
