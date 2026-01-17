import { a as attr, d as escape_html, c as stringify, g as attr_class, i as clsx } from './index5.js';
import { logger } from './logger.js';
function Display($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { value, format = 'medium' } = $$props;
		const userLocale = typeof document !== 'undefined' ? document.documentElement.lang || 'en-US' : 'en-US';
		const formattedRange = (() => {
			if (!value?.start || !value?.end) return '–';
			try {
				const start = new Date(value.start);
				const end = new Date(value.end);
				if (isNaN(start.getTime()) || isNaN(end.getTime())) {
					return 'Invalid Range';
				}
				const dateFormatter = new Intl.DateTimeFormat(userLocale, {
					year: 'numeric',
					month: format === 'short' ? 'short' : 'long',
					day: 'numeric'
				});
				const startFormatted = dateFormatter.format(start);
				const endFormatted = dateFormatter.format(end);
				if (start.toDateString() === end.toDateString()) {
					return startFormatted;
				}
				return `${startFormatted} → ${endFormatted}`;
			} catch (e) {
				logger.warn('Date range formatting error:', e);
				return 'Invalid Range';
			}
		})();
		const duration = (() => {
			if (!value?.start || !value?.end) return null;
			try {
				const start = new Date(value.start);
				const end = new Date(value.end);
				const diffTime = end.getTime() - start.getTime();
				const diffDays = Math.ceil(diffTime / (1e3 * 60 * 60 * 24));
				if (diffDays === 1) return '1 day';
				if (diffDays < 7) return `${diffDays} days`;
				if (diffDays < 30) {
					const weeks = Math.ceil(diffDays / 7);
					return `${weeks} week${weeks > 1 ? 's' : ''}`;
				}
				if (diffDays < 365) {
					const months = Math.ceil(diffDays / 30);
					return `${months} month${months > 1 ? 's' : ''}`;
				}
				const years = Math.ceil(diffDays / 365);
				return `${years} year${years > 1 ? 's' : ''}`;
			} catch {
				return null;
			}
		})();
		const relativeContext = (() => {
			if (!value?.start || !value?.end) return null;
			try {
				const now = /* @__PURE__ */ new Date();
				const start = new Date(value.start);
				const end = new Date(value.end);
				if (start <= now && end >= now) return 'Current';
				if (end < now) return 'Past';
				if (start > now) return 'Future';
				return null;
			} catch {
				return null;
			}
		})();
		const contextClasses = (() => {
			const baseClasses = 'ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';
			const contextMap = {
				Current: 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200',
				Past: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
				Future: 'bg-success-100 text-success-800 dark:bg-success-900 dark:text-success-200'
			};
			return `${baseClasses} ${relativeContext ? contextMap[relativeContext] : ''}`;
		})();
		const tooltipText = (() => {
			if (!value?.start || !value?.end) return void 0;
			try {
				const start = new Date(value.start).toISOString();
				const end = new Date(value.end).toISOString();
				return `${start} to ${end}`;
			} catch {
				return void 0;
			}
		})();
		$$renderer2.push(
			`<span class="inline-flex items-center font-medium text-gray-900 dark:text-gray-100"${attr('title', tooltipText)}><span>${escape_html(formattedRange)}</span> `
		);
		if (duration) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<span class="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400"${attr('aria-label', `Duration: ${stringify(duration)}`)}>(${escape_html(duration)})</span>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (relativeContext) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<span${attr_class(clsx(contextClasses))}${attr('aria-label', `Time context: ${stringify(relativeContext)}`)}>${escape_html(relativeContext)}</span>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></span>`);
	});
}
export { Display as default };
//# sourceMappingURL=Display3.js.map
