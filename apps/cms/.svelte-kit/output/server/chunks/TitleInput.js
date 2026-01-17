import { g as attr_class, d as escape_html, a as attr, i as clsx, h as bind_props } from './index5.js';
import {
	P as widget_seo_suggestiontitle,
	L as widget_seo_suggestioncharacter,
	M as widget_seo_suggestionwidthdesktop,
	N as widget_seo_suggestionwidthmobile,
	Q as widget_seo_suggestionseotitle
} from './_index.js';
function TitleInput($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { title = void 0, titleCharacterWidth, handleTitleChange } = $$props;
		const computedClass =
			title.length >= 50 && title.length <= 60
				? 'input-label green'
				: title.length >= 30 && title.length <= 49
					? 'input-label orange'
					: title.length < 30
						? 'input-label'
						: 'input-label red';
		const titleStatus =
			title.length >= 50 && title.length <= 60
				? 'Optimal length'
				: title.length >= 30 && title.length <= 49
					? 'Length is acceptable'
					: title.length < 30
						? 'Too short'
						: 'Too long';
		$$renderer2.push(`<label for="title-input"${attr_class(clsx(computedClass), 'svelte-czzw1g')}><div class="flex items-center justify-between"><div class="text-black dark:text-white">${escape_html(widget_seo_suggestiontitle())}</div> <div class="flex flex-col text-xs sm:flex-row sm:text-base"><div>${escape_html(widget_seo_suggestioncharacter())} <span class="text-primary-500">${escape_html(title.length)}</span></div> <div>${escape_html(widget_seo_suggestionwidthdesktop())} <span class="text-primary-500">${escape_html(titleCharacterWidth)}</span>/600px
				${escape_html(widget_seo_suggestionwidthmobile())} <span class="text-primary-500">${escape_html(titleCharacterWidth)}</span>/654px</div></div></div> <div id="title-status" class="status-message svelte-czzw1g" aria-live="polite">${escape_html(titleStatus)}</div></label> <input id="title-input" type="text" class="input text-black dark:text-primary-500"${attr('placeholder', widget_seo_suggestionseotitle())} required${attr('value', title)} aria-describedby="title-status"/>`);
		bind_props($$props, { title });
	});
}
export { TitleInput as default };
//# sourceMappingURL=TitleInput.js.map
