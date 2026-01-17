import { d as escape_html, a as attr, e as ensure_array_like, h as bind_props } from './index5.js';
import { k as entrylist_page, l as entrylist_of, m as entrylist_showing, n as entrylist_items, o as entrylist_rows } from './_index.js';
function TablePagination($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let {
			currentPage = void 0,
			pagesCount = 1,
			rowsPerPage = void 0,
			rowsPerPageOptions = [5, 10, 25, 50, 100, 500],
			totalItems = 0,
			onUpdatePage,
			onUpdateRowsPerPage
		} = $$props;
		const computedPagesCount = pagesCount && pagesCount > 0 ? pagesCount : rowsPerPage > 0 ? Math.ceil(totalItems / rowsPerPage) : 1;
		const isFirstPage = currentPage === 1;
		const isLastPage = currentPage === computedPagesCount;
		const startItem = totalItems === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
		const endItem = totalItems === 0 ? 0 : Math.min(currentPage * rowsPerPage, totalItems);
		function updateRowsPerPage(rows) {
			rowsPerPage = rows;
			onUpdateRowsPerPage?.(rows);
		}
		$$renderer2.push(
			`<div class="mb-1 flex items-center justify-between text-xs md:mb-0 md:text-sm" role="status" aria-live="polite"><div><span>${escape_html(entrylist_page())}</span> <span class="text-tertiary-500 dark:text-primary-500">${escape_html(currentPage)}</span> <span>${escape_html(entrylist_of())}</span> <span class="text-tertiary-500 dark:text-primary-500">${escape_html(computedPagesCount)}</span> <span class="ml-4" aria-label="Current items shown">`
		);
		if (totalItems > 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`${escape_html(entrylist_showing())} <span class="text-tertiary-500 dark:text-primary-500">${escape_html(startItem)}</span>–<span class="text-tertiary-500 dark:text-primary-500">${escape_html(endItem)}</span> ${escape_html(entrylist_of())} <span class="text-tertiary-500 dark:text-primary-500">${escape_html(totalItems)}</span> ${escape_html(entrylist_items())}`
			);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`${escape_html(entrylist_showing())} 0 ${escape_html(entrylist_of())} 0 ${escape_html(entrylist_items())}`);
		}
		$$renderer2.push(
			`<!--]--></span></div></div> <nav class="btn-group" aria-label="Table pagination"><button${attr('disabled', isFirstPage, true)} type="button" aria-label="Go to first page" title="First Page" class="btn h-8 w-8 rounded-none border-r border-surface-300 px-1 hover:bg-surface-200 disabled:text-surface-400 disabled:opacity-50! dark:border-surface-50 dark:hover:bg-surface-800"${attr('aria-disabled', isFirstPage)}><iconify-icon icon="material-symbols:first-page" width="24" role="presentation" aria-hidden="true"></iconify-icon></button> <button${attr('disabled', isFirstPage, true)} type="button" aria-label="Go to previous page" title="Previous Page" class="btn h-8 w-8 rounded-none border-r border-surface-300 px-1 hover:bg-surface-200 disabled:text-surface-400 disabled:opacity-50! dark:border-surface-50 dark:hover:bg-surface-800"${attr('aria-disabled', isFirstPage)}><iconify-icon icon="material-symbols:chevron-left" width="24" role="presentation" aria-hidden="true"></iconify-icon></button> `
		);
		$$renderer2.select(
			{
				value: rowsPerPage,
				onchange: (event) => updateRowsPerPage(parseInt(event.target.value)),
				'aria-label': 'Select number of rows per page',
				class:
					'appearance-none bg-transparent p-0 px-2 text-center text-sm text-tertiary-500 hover:bg-surface-200 dark:border-surface-50 dark:text-primary-500 dark:hover:bg-surface-800 sm:px-4',
				title: 'Rows per page'
			},
			($$renderer3) => {
				$$renderer3.push(`<!--[-->`);
				const each_array = ensure_array_like(rowsPerPageOptions);
				for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
					let pageSize = each_array[$$index];
					$$renderer3.option(
						{
							class: 'bg-surface-300 text-black dark:bg-surface-700 dark:text-white',
							value: pageSize
						},
						($$renderer4) => {
							$$renderer4.push(`${escape_html(pageSize)}
				${escape_html(entrylist_rows())}`);
						}
					);
				}
				$$renderer3.push(`<!--]-->`);
			}
		);
		$$renderer2.push(
			` <button${attr('disabled', isLastPage, true)} type="button" aria-label="Go to next page" title="Next Page" class="btn h-8 w-8 rounded-none border-l border-surface-300 px-1 hover:bg-surface-200 disabled:text-surface-400 disabled:opacity-50! dark:border-surface-50 dark:hover:bg-surface-800"${attr('aria-disabled', isLastPage)}><iconify-icon icon="material-symbols:chevron-right" width="24" role="presentation" aria-hidden="true"></iconify-icon></button> <button${attr('disabled', isLastPage, true)} type="button" aria-label="Go to last page" title="Last Page" class="btn h-8 w-8 rounded-none border-l border-surface-300 px-1 hover:bg-surface-200 disabled:text-surface-400 disabled:opacity-50! dark:border-surface-50 dark:hover:bg-surface-800"${attr('aria-disabled', isLastPage)}><iconify-icon icon="material-symbols:last-page" width="24" role="presentation" aria-hidden="true"></iconify-icon></button></nav>`
		);
		bind_props($$props, { currentPage, rowsPerPage });
	});
}
export { TablePagination as T };
//# sourceMappingURL=TablePagination.js.map
