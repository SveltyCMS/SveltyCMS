import { g as attr_class, a as attr, i as clsx, d as escape_html, h as bind_props } from './index5.js';
import { twMerge } from 'tailwind-merge';
function DropDown($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let {
			items = [],
			// Array of selectable items
			label = '',
			// Optional label for the dropdown
			icon = void 0,
			// Optional icon for the dropdown button
			class: className = '',
			// Custom class for the dropdown container
			show = true,
			// Whether to show the dropdown
			active = ''
			// Currently active dropdown ID
		} = $$props;
		let expanded = false;
		const dropdownId = `dropdown-${Math.random().toString(36).substring(2, 9)}`;
		const listboxId = `${dropdownId}-menu`;
		function getActiveItem() {
			return items.find((item) => item.active && item.active());
		}
		function getButtonText() {
			const ai = getActiveItem();
			return (ai && (ai.name || ai.title)) || label;
		}
		function getButtonIcon() {
			const ai = getActiveItem();
			return ai?.icon || icon;
		}
		$$renderer2.push(
			`<div${attr_class(clsx(twMerge('relative', className)), void 0, { hidden: !show })}><button class="preset-filled-tertiary-500 btn flex w-fit items-center gap-1 rounded dark:preset-outlined-primary-500" aria-haspopup="true"${attr('aria-expanded', expanded)}${attr('aria-controls', listboxId)}${attr('id', `${dropdownId}-button`)}${attr('aria-label', label || void 0)}>`
		);
		if (getButtonIcon()) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<iconify-icon${attr('icon', getButtonIcon())} width="18"${attr_class(clsx(getActiveItem() ? 'text-tertiary-50 dark:text-tertiary-300' : 'text-surface-800 dark:text-surface-200'))}></iconify-icon>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--> <span${attr_class('hidden text-sm sm:inline', void 0, {
				'text-tertiary-50': !!getActiveItem(),
				'text-surface-800': !getActiveItem()
			})}>${escape_html(getButtonText())}</span></button> `
		);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div>`);
		bind_props($$props, { active });
	});
}
export { DropDown as default };
//# sourceMappingURL=DropDown.js.map
