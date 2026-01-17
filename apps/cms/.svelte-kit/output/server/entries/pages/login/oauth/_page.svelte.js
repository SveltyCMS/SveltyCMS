import { d as escape_html, a as attr } from '../../../../chunks/index5.js';
import { S as SveltyCMS_LogoFull } from '../../../../chunks/SveltyCMS_LogoFull.js';
import { F as FloatingInput } from '../../../../chunks/floatingInput.js';
import {
	C as oauth_entertoken,
	D as registration_token,
	E as signup_registrationtoken,
	F as button_cancel,
	G as button_send,
	H as oauth_signup
} from '../../../../chunks/_index.js';
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { data } = $$props;
		let token = '';
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			$$renderer3.push(
				`<div class="grid h-full w-full place-items-center bg-[#242728]"><form class="card m-2 flex flex-col items-center gap-2 rounded border p-2 sm:p-6" method="post" action="?/OAuth">`
			);
			SveltyCMS_LogoFull($$renderer3);
			$$renderer3.push(`<!----> `);
			if (data.requiresToken) {
				$$renderer3.push('<!--[-->');
				$$renderer3.push(`<label><h2 class="mb-2 text-center text-xl font-bold text-primary-500">${escape_html(oauth_entertoken())}</h2> `);
				FloatingInput($$renderer3, {
					id: 'token',
					name: 'token',
					type: 'text',
					required: true,
					label: registration_token?.() || signup_registrationtoken?.(),
					icon: 'mdi:key-chain',
					iconColor: 'white',
					textColor: 'white',
					passwordIconColor: 'white',
					inputClass: 'text-white',
					autocomplete: 'off',
					minlength: 16,
					maxlength: 48,
					get value() {
						return token;
					},
					set value($$value) {
						token = $$value;
						$$settled = false;
					}
				});
				$$renderer3.push(`<!----></label>`);
			} else {
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]--> `);
			{
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(
				`<!--]--> <div class="mt-2 flex w-full justify-between gap-1 sm:gap-2"><button type="button"${attr('aria-label', button_cancel())} class="variant-filled btn">${escape_html(button_cancel())}</button> <button type="submit"${attr('disabled', true, true)}${attr('aria-label', button_send())} class="variant-filled btn items-center"><iconify-icon icon="flat-color-icons:google" color="white" width="20" class="mr-1"></iconify-icon> <p>${escape_html(oauth_signup())}</p></button></div></form></div>`
			);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer2.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer2.subsume($$inner_renderer);
	});
}
export { _page as default };
//# sourceMappingURL=_page.svelte.js.map
