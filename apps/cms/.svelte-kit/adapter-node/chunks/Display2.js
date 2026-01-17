import { a as attr, d as escape_html } from './index5.js';
import { logger } from './logger.js';
function Display($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { value, format = 'medium', showRelative = true } = $$props;
		const userLocale = typeof document !== 'undefined' ? document.documentElement.lang || 'en-US' : 'en-US';
		const dateOptions = (() => {
			const optionsMap = {
				short: { dateStyle: 'short' },
				medium: { dateStyle: 'medium' },
				long: { dateStyle: 'long' },
				full: { dateStyle: 'full' }
			};
			return optionsMap[format];
		})();
		const relativeTime = (() => {
			if (!value || !showRelative) return null;
			try {
				const date = new Date(value);
				if (isNaN(date.getTime())) return null;
				const now = /* @__PURE__ */ new Date();
				const diffTime = now.getTime() - date.getTime();
				const diffDays = Math.floor(diffTime / (1e3 * 60 * 60 * 24));
				if (diffDays === 0) return 'Today';
				if (diffDays === 1) return 'Yesterday';
				if (diffDays === -1) return 'Tomorrow';
				if (diffDays > 1 && diffDays <= 7) return `${diffDays} days ago`;
				if (diffDays < -1 && diffDays >= -7) return `In ${Math.abs(diffDays)} days`;
				return null;
			} catch {
				return null;
			}
		})();
		const formattedDate = (() => {
			if (!value) return '–';
			try {
				const date = new Date(value);
				if (isNaN(date.getTime())) return 'Invalid Date';
				return new Intl.DateTimeFormat(userLocale, dateOptions).format(date);
			} catch (e) {
				logger.warn('Date formatting error:', e);
				return 'Invalid Date';
			}
		})();
		const isoString = (() => {
			if (!value) return void 0;
			try {
				const date = new Date(value);
				return isNaN(date.getTime()) ? void 0 : date.toISOString();
			} catch {
				return void 0;
			}
		})();
		const displayText = relativeTime || formattedDate;
		$$renderer2.push(
			`<time class="inline-flex items-center font-medium text-gray-900 dark:text-gray-100"${attr('title', isoString)}${attr('datetime', isoString)}>`
		);
		if (relativeTime) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<span class="mr-1 text-primary-600 dark:text-primary-400">${escape_html(displayText)}</span> <span class="text-xs text-gray-500 dark:text-gray-400">(${escape_html(formattedDate)})</span>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`${escape_html(displayText)}`);
		}
		$$renderer2.push(`<!--]--></time>`);
	});
}
export { Display as default };
//# sourceMappingURL=Display2.js.map
