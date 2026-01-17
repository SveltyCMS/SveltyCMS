import { a as attr, g as attr_class, i as clsx, h as bind_props } from './index5.js';
import './store.svelte.js';
import './logger.js';
import {
	t as table_search_placeholder,
	c as table_search_aria,
	d as table_clear_search,
	f as table_search_toggle,
	g as table_filter_toggle,
	h as table_column_toggle,
	i as table_density_toggle,
	j as table_density_label
} from './_index.js';
function TableFilter($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let {
			globalSearchValue = '',
			searchShow = false,
			filterShow = false,
			columnShow = false,
			density = 'normal',
			densityOptions = ['compact', 'normal', 'comfortable'],
			showDeleted = false
		} = $$props;
		function getDensityDisplayName() {
			return density.charAt(0).toUpperCase() + density.slice(1);
		}
		function getDensityIcon() {
			switch (density) {
				case 'compact':
					return 'material-symbols:align-space-even-rounded';
				case 'normal':
					return 'material-symbols:align-space-around-rounded';
				case 'comfortable':
					return 'material-symbols:align-space-between-rounded';
				default:
					return 'material-symbols:align-space-around-rounded';
			}
		}
		if (searchShow) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="input-group input-group-divider grid grid-cols-[1fr_auto] h-10 w-full max-w-xs sm:max-w-sm transition-all duration-300 z-50"><input type="text"${attr('placeholder', table_search_placeholder())}${attr('aria-label', table_search_aria())}${attr('value', globalSearchValue)} class="input w-full h-full outline-none border-none bg-transparent px-4 transition-all duration-500 ease-in-out focus:border-tertiary-500 dark:text-surface-50 dark:bg-surface-800 dark:focus:border-primary-500"/> <button${attr('aria-label', table_clear_search())} class="preset-filled-surface-500 w-10 flex items-center justify-center"><iconify-icon icon="ic:outline-search-off" width="20"></iconify-icon></button></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(
				`<button type="button"${attr('aria-label', table_search_toggle())}${attr('title', table_search_toggle())} class="btn preset-outlined-surface-500 rounded-full"><iconify-icon icon="material-symbols:search-rounded" width="24"${attr_class(clsx(searchShow ? 'text-tertiary-500 dark:text-primary-500' : ''))}></iconify-icon></button> <button type="button"${attr('aria-label', table_filter_toggle())}${attr('title', table_filter_toggle())} class="btn preset-outlined-surface-500 rounded-full"><iconify-icon icon="carbon:filter-edit" width="24"${attr_class(clsx(filterShow ? 'text-tertiary-500 dark:text-primary-500' : ''))}></iconify-icon></button> <button type="button"${attr('aria-label', table_column_toggle())}${attr('title', table_column_toggle())} class="btn preset-outlined-surface-500 rounded-full"><iconify-icon icon="fluent:column-triple-edit-24-regular" width="24"${attr_class(clsx(columnShow ? 'text-tertiary-500 dark:text-primary-500' : ''))}></iconify-icon></button> <button type="button"${attr('aria-label', table_density_toggle())}${attr('title', table_density_label({ density: getDensityDisplayName() }))} class="btn preset-outlined-surface-500 rounded-full"><iconify-icon${attr('icon', getDensityIcon())} width="24"></iconify-icon></button>`
			);
		}
		$$renderer2.push(`<!--]-->`);
		bind_props($$props, {
			globalSearchValue,
			searchShow,
			filterShow,
			columnShow,
			density,
			densityOptions,
			showDeleted
		});
	});
}
export { TableFilter as T };
//# sourceMappingURL=TableFilter.js.map
