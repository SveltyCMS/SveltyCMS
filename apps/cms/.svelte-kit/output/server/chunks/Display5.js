import { g as attr_class, a as attr, d as escape_html } from './index5.js';
import { a as app } from './store.svelte.js';
import { publicEnv } from './globalSettings.svelte.js';
function Display($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { field, value } = $$props;
		const lang = field?.translated ? app.contentLanguage.toLowerCase() : (publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en').toLowerCase();
		const fullText = value?.[lang] ?? value?.[Object.keys(value || {})[0]] ?? '–';
		const shouldTruncate = typeof fullText === 'string' && fullText.length > 50;
		const displayText = shouldTruncate ? `${fullText.substring(0, 50)}...` : fullText;
		$$renderer2.push(
			`<span${attr_class('truncate', void 0, { 'cursor-help': shouldTruncate })}${attr('title', shouldTruncate ? fullText : void 0)}${attr('aria-label', shouldTruncate ? `${displayText} (truncated, full text: ${fullText})` : void 0)}>${escape_html(displayText)}</span>`
		);
	});
}
export { Display as default };
//# sourceMappingURL=Display5.js.map
