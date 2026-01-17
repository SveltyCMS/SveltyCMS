import { a as attr, b as attr_style, e as ensure_array_like, c as stringify, d as escape_html } from '../../../chunks/index5.js';
import { p as page } from '../../../chunks/index6.js';
import { S as SiteName, a as SveltyCMS_Logo } from '../../../chunks/SveltyCMS_Logo.js';
import { a as app } from '../../../chunks/store.svelte.js';
import { e as error_pagenotfound, a as error_wrong, b as error_gofrontpage } from '../../../chunks/_index.js';
function _error($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const speed = 100;
		const size = 140;
		const font = 0.9;
		const repeat = 3;
		const separator = ' • ';
		const siteName = page.data?.settings?.SITE_NAME || 'SveltyCMS';
		const combinedString = Array.from({ length: repeat }, () => siteName + separator).join('');
		const array = combinedString.split('').filter((char) => char !== ' ');
		function isCMSChar(index) {
			const posInPattern = index % 10;
			return posInPattern >= 6 && posInPattern < 9;
		}
		if (page) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<main${attr('lang', app.contentLanguage)} class="bg-linear-to-t flex h-screen w-full flex-col items-center justify-center from-surface-900 via-surface-700 to-surface-900 text-white"><div class="relative"><div class="relative animate-spin rounded-full"${attr_style(`width: ${stringify(size)}px; height: ${stringify(size)}px; font-size: ${stringify(font)}em; animation-duration: ${stringify(speed * 200)}ms;`)}><!--[-->`
			);
			const each_array = ensure_array_like(array);
			for (let index = 0, $$length = each_array.length; index < $$length; index++) {
				let char = each_array[index];
				$$renderer2.push(
					`<div class="absolute left-1/2 top-0 h-full w-4 -translate-x-1/2 text-center uppercase"${attr_style(`transform: translateX(-50%) rotate(${stringify((1 / array.length) * index)}turn);`)}>`
				);
				if (isCMSChar(index)) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`<span class="text-primary-500">`);
					SiteName($$renderer2, { char });
					$$renderer2.push(`<!----></span>`);
				} else {
					$$renderer2.push('<!--[!-->');
					SiteName($$renderer2, { char });
				}
				$$renderer2.push(`<!--]--></div>`);
			}
			$$renderer2.push(`<!--]--></div> `);
			SveltyCMS_Logo($$renderer2, {
				fill: 'red',
				className: 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-16 mb-2'
			});
			$$renderer2.push(
				`<!----></div> <div class="relative"><h1 class="relative text-9xl font-extrabold tracking-widest text-white">${escape_html(page.status)}</h1> <div class="absolute left-1/2 top-1/2 mx-auto -translate-x-1/2 -translate-y-1/2 rotate-12 transform rounded-md bg-error-600/80 px-2 text-center text-sm font-bold text-white"><div class="min-w-[200px]">${escape_html(page.url)}</div> <div class="whitespace-nowrap">${escape_html(error_pagenotfound())}</div></div></div> <h1 class="max-w-2xl text-center text-3xl font-extrabold tracking-widest text-surface-400">`
			);
			if (page.error) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`${escape_html(page.error.message)}`);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(
				`<!--]--></h1> <p class="mt-2 text-lg text-white">${escape_html(error_wrong())}</p> <a href="/" class="relative mt-5 block rounded-full bg-linear-to-br from-error-700 via-error-600 to-error-700 px-8 py-4 font-bold uppercase text-white! shadow-xl">${escape_html(error_gofrontpage())}</a></main>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]-->`);
	});
}
export { _error as default };
//# sourceMappingURL=_error.svelte.js.map
