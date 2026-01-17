import { h as bind_props } from './index5.js';
function VideoDialog($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { show = false, editor } = $$props;
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			if (show) {
				$$renderer3.push('<!--[-->');
				$$renderer3.push(
					`<div class="fixed inset-0 z-40 bg-black/30" role="presentation"></div> <div role="dialog" aria-modal="true" aria-labelledby="video-dialog-title" class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 transform rounded-lg bg-white p-6 shadow-xl"><iconify-icon icon="material-symbols:close" width="24" role="button" aria-label="Close" class="absolute right-3 top-3 z-10 cursor-pointer text-gray-500 hover:text-gray-800" tabindex="0"></iconify-icon> <h3 id="video-dialog-title" class="mb-4 text-lg font-medium">Add Video</h3> `
				);
				{
					$$renderer3.push('<!--[!-->');
					$$renderer3.push(
						`<div class="relative mt-2 flex flex-col items-center justify-center gap-4"><p class="text-sm text-gray-500">Video upload is not yet implemented.</p> <p>or</p> <div class="flex w-full justify-center gap-2"><button class="preset-outline-primary-500 btn w-full" disabled>Browse locally</button> <button class="variant-filled-secondary btn w-full">YouTube</button></div></div>`
					);
				}
				$$renderer3.push(`<!--]--></div>`);
			} else {
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]-->`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer2.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer2.subsume($$inner_renderer);
		bind_props($$props, { show });
	});
}
export { VideoDialog as default };
//# sourceMappingURL=VideoDialog.js.map
