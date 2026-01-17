import { g as attr_class, d as escape_html, a as attr, i as clsx, h as bind_props } from './index5.js';
import {
	K as widget_seo_suggestiondescription,
	L as widget_seo_suggestioncharacter,
	M as widget_seo_suggestionwidthdesktop,
	N as widget_seo_suggestionwidthmobile,
	O as widget_seo_suggestionseodescription
} from './_index.js';
function DescriptionInput($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { description = void 0, descriptionCharacterWidth, handleDescriptionChange } = $$props;
		const computedClass =
			description.length >= 120 && description.length <= 165
				? 'input-label green'
				: description.length >= 30 && description.length <= 119
					? 'input-label orange'
					: description.length < 30
						? 'input-label'
						: 'input-label red';
		const descriptionStatus =
			description.length >= 120 && description.length <= 165
				? 'Optimal length'
				: description.length >= 30 && description.length <= 119
					? 'Length is acceptable'
					: description.length < 30
						? 'Too short'
						: 'Too long';
		$$renderer2.push(`<label for="description-input"${attr_class(clsx(computedClass), 'svelte-l3srj4')}><div class="flex justify-between"><div class="text-black dark:text-white">${escape_html(widget_seo_suggestiondescription())}</div> <div class="flex flex-col text-xs sm:flex-row sm:text-base"><div>${escape_html(widget_seo_suggestioncharacter())} <span class="text-primary-500">${escape_html(description.length)}</span></div> <div>${escape_html(widget_seo_suggestionwidthdesktop())} <span class="text-primary-500">${escape_html(descriptionCharacterWidth)}</span>/970px
				${escape_html(widget_seo_suggestionwidthmobile())} <span class="text-primary-500">${escape_html(descriptionCharacterWidth)}</span>/981px</div></div></div> <div class="status-message svelte-l3srj4" aria-live="polite">${escape_html(descriptionStatus)}</div></label> <textarea id="description-input" name="description-input"${attr('placeholder', widget_seo_suggestionseodescription())} rows="2" cols="50" class="input text-black dark:text-primary-500" aria-describedby="description-status">`);
		const $$body = escape_html(description);
		if ($$body) {
			$$renderer2.push(`${$$body}`);
		}
		$$renderer2.push(`</textarea>`);
		bind_props($$props, { description });
	});
}
export { DescriptionInput as default };
//# sourceMappingURL=DescriptionInput.js.map
