import { g as attr_class, c as stringify, a as attr, d as escape_html } from './index5.js';
import { g as getFieldName } from './utils.js';
function Display($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { field, value, children } = $$props;
		const fieldName = getFieldName(field);
		const variantClasses = {
			default: {
				container: '',
				header: 'border-b border-gray-200 bg-transparent dark:border-gray-700',
				content: 'bg-transparent pt-3'
			},
			card: {
				container: 'rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-700',
				header: 'rounded-t-lg border-b border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-700',
				content: 'p-4'
			},
			bordered: {
				container: 'rounded-lg border border-gray-300 dark:border-gray-600',
				header: 'rounded-t-lg border-b border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-700',
				content: 'rounded-b-lg bg-white p-4 dark:bg-gray-800'
			}
		};
		const variant = variantClasses[field.variant] || variantClasses.default;
		$$renderer2.push(`<div${attr_class(`mb-4 w-full ${stringify(variant.container)}`)}>`);
		if (field.groupTitle || field.collapsible) {
			$$renderer2.push('<!--[-->');
			if (field.collapsible) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<button type="button"${attr_class(`flex w-full items-center justify-between p-3 transition-colors duration-200 ${stringify(variant.header)} ${stringify(field.collapsible ? 'cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:hover:bg-gray-700' : '')}`)}${attr('aria-expanded', true)}${attr('aria-controls', `${fieldName}-content`)}>`
				);
				if (field.groupTitle) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`<h4 class="m-0 text-base font-semibold text-gray-900 dark:text-gray-100">${escape_html(field.groupTitle)}</h4>`);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(
					`<!--]--> <div${attr_class(`transition-transform duration-200 ease-in-out ${stringify('')}`)}><iconify-icon icon="mdi:chevron-down" width="18" height="18" class="text-gray-500"></iconify-icon></div></button>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(`<div${attr_class(`flex items-center justify-between p-3 ${stringify(variant.header)}`)}>`);
				if (field.groupTitle) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`<h4 class="m-0 text-base font-semibold text-gray-900 dark:text-gray-100">${escape_html(field.groupTitle)}</h4>`);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--></div>`);
			}
			$$renderer2.push(`<!--]-->`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--> <div${attr('id', field.collapsible ? `${fieldName}-content` : void 0)}${attr_class(`overflow-hidden transition-all duration-200 ease-in-out ${stringify(variant.content)} ${stringify('max-h-screen opacity-100')}`)}>`
		);
		if (children) {
			$$renderer2.push('<!--[-->');
			children($$renderer2);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			if (value && Object.keys(value).length > 0) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<div class="rounded border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900"><pre class="whitespace-pre-wrap font-mono text-sm text-gray-700 dark:text-gray-300">${escape_html(JSON.stringify(value, null, 2))}</pre></div>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(
					`<div class="flex items-center justify-center px-4 py-6"><p class="text-center text-sm italic text-gray-500 dark:text-gray-400">No content in this group</p></div>`
				);
			}
			$$renderer2.push(`<!--]-->`);
		}
		$$renderer2.push(`<!--]--></div></div>`);
	});
}
export { Display as default };
//# sourceMappingURL=Display4.js.map
