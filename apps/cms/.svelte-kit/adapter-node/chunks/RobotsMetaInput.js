import { h as bind_props } from './index5.js';
function RobotsMetaInput($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { value = void 0 } = $$props;
		$$renderer2.push(
			`<label for="robots-meta-select" class="label text-black dark:text-primary-500"><span class="text-token">Robots Meta Data:</span> `
		);
		$$renderer2.select({ class: 'select', id: 'robots-meta-select', value }, ($$renderer3) => {
			$$renderer3.option({ value: 'index, follow' }, ($$renderer4) => {
				$$renderer4.push(`Index, Follow`);
			});
			$$renderer3.option({ value: 'noindex, follow' }, ($$renderer4) => {
				$$renderer4.push(`Noindex, Follow`);
			});
			$$renderer3.option({ value: 'index, nofollow' }, ($$renderer4) => {
				$$renderer4.push(`Index, Nofollow`);
			});
			$$renderer3.option({ value: 'noindex, nofollow' }, ($$renderer4) => {
				$$renderer4.push(`Noindex, Nofollow`);
			});
			$$renderer3.option({ value: 'noarchive' }, ($$renderer4) => {
				$$renderer4.push(`Noarchive`);
			});
			$$renderer3.option({ value: 'nosnippet' }, ($$renderer4) => {
				$$renderer4.push(`Nosnippet`);
			});
			$$renderer3.option({ value: 'noimageindex' }, ($$renderer4) => {
				$$renderer4.push(`Noimageindex`);
			});
			$$renderer3.option({ value: 'notranslate' }, ($$renderer4) => {
				$$renderer4.push(`Notranslate`);
			});
		});
		$$renderer2.push(`</label>`);
		bind_props($$props, { value });
	});
}
export { RobotsMetaInput as default };
//# sourceMappingURL=RobotsMetaInput.js.map
