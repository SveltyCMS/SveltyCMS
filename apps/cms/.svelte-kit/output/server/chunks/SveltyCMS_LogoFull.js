import { d as escape_html } from './index5.js';
import 'clsx';
import { a as SveltyCMS_Logo, S as SiteName } from './SveltyCMS_Logo.js';
import { browser } from './index3.js';
import { B as logo_slogan } from './_index.js';
import { g as getLocale } from './runtime.js';
function SveltyCMS_LogoFull($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		function getSlogan() {
			try {
				if (browser && getLocale());
				return 'Content made simple';
			} catch {
				return 'Content made simple';
			}
		}
		const slogan = getSlogan();
		$$renderer2.push(
			`<div class="absolute left-1/2 top-1/3 flex -translate-x-1/2 -translate-y-1/2 transform items-center justify-center"><div class="relative flex h-[170px] w-[170px] items-center justify-center rounded-full bg-white"><svg width="160" height="160" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform"><circle cx="80" cy="80" r="75" stroke-width="2" stroke-dasharray="191 191" stroke-dashoffset="191" transform="rotate(51.5, 80, 80)" class="fill-none stroke-error-500"></circle><circle cx="80" cy="80" r="75" stroke-width="2" stroke-dasharray="191 191" stroke-dashoffset="191" transform="rotate(231.5, 80, 80)" class="fill-none stroke-error-500"></circle></svg> <svg width="170" height="170" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform"><circle cx="85" cy="85" r="80" stroke-width="2" stroke-dasharray="205 205" stroke-dashoffset="205" transform="rotate(50, 85, 85)" class="fill-none stroke-black"></circle><circle cx="85" cy="85" r="80" stroke-width="2" stroke-dasharray="205 205" stroke-dashoffset="205" transform="rotate(230, 85, 85)" class="fill-none stroke-black"></circle></svg> <div class="absolute left-1/2 top-[70px] flex -translate-x-1/2 -translate-y-1/2 transform flex-col items-center justify-center text-center">`
		);
		SveltyCMS_Logo($$renderer2, { fill: 'red', className: 'w-14 h-14' });
		$$renderer2.push(`<!----> <div class="-mt-2 text-3xl font-bold">`);
		SiteName($$renderer2, { highlight: 'CMS', textClass: 'text-black' });
		$$renderer2.push(`<!----></div> <div class="-mt-px text-[13px] font-bold text-surface-500">${escape_html(slogan)}</div></div></div></div>`);
	});
}
export { SveltyCMS_LogoFull as S };
//# sourceMappingURL=SveltyCMS_LogoFull.js.map
