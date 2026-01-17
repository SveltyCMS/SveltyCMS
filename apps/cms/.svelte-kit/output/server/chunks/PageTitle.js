import { a as attr, g as attr_class, e as ensure_array_like, d as escape_html, i as clsx } from './index5.js';
import { u as ui } from './UIStore.svelte.js';
import './screenSizeStore.svelte.js';
function PageTitle($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const {
			name,
			highlight = '',
			icon,
			iconColor = 'text-tertiary-500 dark:text-primary-500',
			iconSize = '32',
			showBackButton = false,
			backUrl = '',
			truncate = true,
			onBackClick,
			children
		} = $$props;
		const titleParts = () => {
			if (highlight && name.toLowerCase().includes(highlight.toLowerCase())) {
				const regex = new RegExp(`(${highlight})`, 'gi');
				return name.split(regex);
			}
			return [name];
		};
		$$renderer2.push(`<div class="my-1.5 flex w-full min-w-0 items-center justify-between gap-4"><div class="flex min-w-0 items-center">`);
		if (ui.state.leftSidebar === 'hidden') {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<button type="button" aria-label="Open Sidebar" class="preset-outlined-surface-500btn-icon"><iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon></button>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--> <h1 class="transition-max-width h1 relative ml-2 flex items-center gap-1 font-bold" style="font-size: clamp(1.5rem, 3vw + 1rem, 2.25rem);" aria-live="polite" data-cms-field="pageTitle" data-cms-type="text">`
		);
		if (icon) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<iconify-icon${attr('icon', icon)}${attr('width', iconSize)}${attr_class(`mr-1 shrink-0 ${iconColor} sm:mr-2`)} aria-hidden="true"></iconify-icon>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--> <span${attr_class('', void 0, {
				block: truncate,
				'overflow-hidden': truncate,
				'text-ellipsis': truncate,
				'whitespace-nowrap': truncate
			})}><!--[-->`
		);
		const each_array = ensure_array_like(titleParts());
		for (let i = 0, $$length = each_array.length; i < $$length; i++) {
			let part = each_array[i];
			$$renderer2.push(
				`<span${attr_class(clsx(i % 2 === 1 ? 'font-semibold text-tertiary-500 dark:text-primary-500' : ''))}>${escape_html(part)}</span>`
			);
		}
		$$renderer2.push(
			`<!--]--></span> <span class="sr-only absolute inset-0 overflow-hidden whitespace-normal">${escape_html(name)}</span></h1></div> <div class="flex items-center gap-2">`
		);
		if (children) {
			$$renderer2.push('<!--[-->');
			children($$renderer2);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (showBackButton) {
			$$renderer2.push('<!--[-->');
			if (backUrl) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<a${attr('href', backUrl)} aria-label="Go back" class="btn-icon rounded-full border border-surface-500 dark:border-surface-200 hover:bg-surface-500/10 shrink-0" data-cms-action="back" data-sveltekit-preload-data="hover"><iconify-icon icon="ri:arrow-left-line" width="24" aria-hidden="true"></iconify-icon></a>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(
					`<button aria-label="Go back" tabindex="0" class="btn-icon rounded-full border border-surface-500 dark:border-surface-200 hover:bg-surface-500/10 shrink-0" data-cms-action="back"><iconify-icon icon="ri:arrow-left-line" width="24" aria-hidden="true"></iconify-icon></button>`
				);
			}
			$$renderer2.push(`<!--]-->`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div></div>`);
	});
}
export { PageTitle as P };
//# sourceMappingURL=PageTitle.js.map
