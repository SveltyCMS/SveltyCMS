import {
	g as attr_class,
	i as clsx,
	a as attr,
	d as escape_html,
	e as ensure_array_like,
	b as attr_style,
	c as stringify
} from '../../../../chunks/index5.js';
import '@sveltejs/kit/internal';
import '../../../../chunks/exports.js';
import '../../../../chunks/utils3.js';
import '@sveltejs/kit/internal/server';
import '../../../../chunks/state.svelte.js';
import '../../../../chunks/client.js';
import '../../../../chunks/logger.js';
import '../../../../chunks/collectionStore.svelte.js';
import '../../../../chunks/UIStore.svelte.js';
import { s as screen } from '../../../../chunks/screenSizeStore.svelte.js';
import { P as PageTitle } from '../../../../chunks/PageTitle.js';
import '../../../../chunks/index7.js';
import {
	ai as collection_pagetitle,
	aj as collection_addcategory,
	ak as collection_add,
	ad as button_save,
	a3 as collection_description
} from '../../../../chunks/_index.js';
import '../../../../chunks/functions.js';
import '../../../../chunks/store.svelte.js';
function TreeViewNode($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { item, isOpen } = $$props;
		const name = item.name || 'Untitled';
		const icon = item.icon || (item.nodeType === 'category' ? 'bi:folder' : 'bi:collection');
		const isCategory = item.nodeType === 'category';
		const containerClass = isCategory
			? 'group w-full min-h-[48px] p-2 sm:p-3 rounded bg-gradient-to-r from-tertiary-500/10 to-tertiary-600/5 border-2 border-tertiary-500/30 flex items-center gap-2 sm:gap-3 mb-2 cursor-pointer hover:border-tertiary-500 hover:shadow-lg hover:from-tertiary-500/20 hover:to-tertiary-600/10 transition-all duration-300 ease-out min-w-0 overflow-hidden'
			: 'group w-full min-h-[48px] p-2 sm:p-3 rounded bg-gradient-to-r from-surface-100 to-surface-50 dark:from-surface-700 dark:to-surface-800 border-2 border-l-4 border-surface-500/40 border-l-surface-500 flex items-center gap-2 sm:gap-3 mb-2 cursor-pointer hover:border-surface-500 hover:shadow-lg hover:translate-x-1 transition-all duration-300 ease-out min-w-0 overflow-hidden';
		const iconClass = isCategory
			? 'text-tertiary-500 group-hover:text-tertiary-600 transition-colors duration-200'
			: 'text-error-500 group-hover:text-error-600 transition-colors duration-200';
		$$renderer2.push(`<div${attr_class(clsx(containerClass), 'svelte-1cjg9nl')} role="button" tabindex="0">`);
		if (item.hasChildren || isCategory) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<button type="button" class="btn-icon preset-tonal hover:preset-filled transition-all duration-200 hover:scale-110 svelte-1cjg9nl"${attr('aria-label', isOpen ? 'Collapse' : 'Expand')}><iconify-icon${attr('icon', isOpen ? 'bi:chevron-down' : 'bi:chevron-right')} width="20" class="transition-transform duration-200 svelte-1cjg9nl"></iconify-icon></button>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<div class="w-10 svelte-1cjg9nl"></div>`);
		}
		$$renderer2.push(
			`<!--]--> <div class="relative svelte-1cjg9nl"><iconify-icon${attr('icon', icon)} width="24"${attr_class(clsx(iconClass), 'svelte-1cjg9nl')}></iconify-icon> `
		);
		if (isCategory) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<div class="absolute -top-1 -right-1 w-2 h-2 bg-tertiary-500 rounded-full animate-pulse svelte-1cjg9nl"></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--></div> <div class="flex flex-col gap-1 min-w-0 shrink svelte-1cjg9nl"><div class="flex items-center gap-1 sm:gap-2 flex-wrap svelte-1cjg9nl"><span class="font-bold text-sm sm:text-base leading-none truncate svelte-1cjg9nl">${escape_html(name)}</span> `
		);
		if (isCategory) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<span class="badge font-semibold bg-tertiary-500 text-white text-[9px] sm:text-[10px] px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-sm uppercase shadow-sm svelte-1cjg9nl">Category</span>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(
				`<span class="badge font-semibold bg-surface-500 text-white text-[9px] sm:text-[10px] px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-sm uppercase shadow-sm svelte-1cjg9nl">Collection</span>`
			);
		}
		$$renderer2.push(`<!--]--></div></div> `);
		if (screen.isDesktop) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<div class="flex-1 px-4 min-w-0 flex justify-start svelte-1cjg9nl">`);
			if (item.description) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<div class="relative group/desc svelte-1cjg9nl"><span class="italic text-sm opacity-70 truncate w-full max-w-[500px] text-left hover:opacity-100 transition-opacity duration-200 svelte-1cjg9nl"${attr('title', item.description)}>${escape_html(item.description)}</span></div>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (item.slug) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<span class="badge bg-surface-200 dark:bg-surface-700 text-surface-900 dark:text-surface-100 px-3 py-1 rounded-sm font-mono text-xs shadow-sm svelte-1cjg9nl">/${escape_html(item.slug)}</span>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--> <div class="flex gap-1 sm:gap-2 ml-auto shrink-0 transition-opacity duration-200 svelte-1cjg9nl"><button type="button" class="btn-icon preset-tonal hover:preset-filled rounded transition-all duration-200 hover:scale-110 svelte-1cjg9nl" title="Edit"><iconify-icon icon="mdi:pencil-outline" width="18" class="text-primary-500 svelte-1cjg9nl"></iconify-icon></button> <button type="button" class="btn-icon preset-tonal hover:preset-filled rounded transition-all duration-200 hover:scale-110 svelte-1cjg9nl" title="Duplicate"><iconify-icon icon="mdi:content-copy" width="18" class="text-tertiary-500 svelte-1cjg9nl"></iconify-icon></button> <button type="button" class="btn-icon preset-tonal hover:preset-filled rounded transition-all duration-200 hover:scale-110 svelte-1cjg9nl" title="Delete"><iconify-icon icon="lucide:trash-2" width="18" class="text-error-500 svelte-1cjg9nl"></iconify-icon></button> <div class="btn-icon preset-tonal rounded cursor-grab active:cursor-grabbing opacity-60 hover:opacity-100 flex items-center justify-center ml-2 hover:bg-surface-300 dark:hover:bg-surface-600 transition-all duration-200 hover:scale-110 svelte-1cjg9nl" aria-hidden="true" title="Drag to reorder"><iconify-icon icon="mdi:drag-vertical" width="22" class="svelte-1cjg9nl"></iconify-icon></div></div></div>`
		);
	});
}
function TreeViewBoard($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let searchText = '';
		let treeData = [];
		let expandedNodes = /* @__PURE__ */ new Set();
		const filteredItems = (() => {
			if (!searchText.trim()) return treeData;
			const searchLower = searchText.toLowerCase();
			return treeData.filter((item) => item.name.toLowerCase().includes(searchLower));
		})();
		const hierarchicalData = (() => {
			const items = filteredItems;
			const itemMap = /* @__PURE__ */ new Map();
			items.forEach((item) => {
				itemMap.set(item.id, { ...item, children: [], level: 0 });
			});
			const roots = [];
			items.forEach((item) => {
				const enhanced = itemMap.get(item.id);
				if (!enhanced) return;
				if (item.parent && itemMap.has(item.parent)) {
					const parent = itemMap.get(item.parent);
					if (parent) {
						parent.children.push(enhanced);
						enhanced.level = parent.level + 1;
					}
				} else {
					roots.push(enhanced);
				}
			});
			return roots;
		})();
		const rootItems = hierarchicalData;
		function treeNode($$renderer3, item, level) {
			$$renderer3.push(`<div class="tree-node-container svelte-1esk4n5"${attr_style(`margin-left: ${stringify(level * 0.75)}rem`)}>`);
			TreeViewNode($$renderer3, {
				item: {
					...item,
					hasChildren: item.children && item.children.length > 0
				},
				isOpen: expandedNodes.has(item.id)
			});
			$$renderer3.push(`<!----> `);
			if (expandedNodes.has(item.id) && item.children && item.children.length > 0) {
				$$renderer3.push('<!--[-->');
				$$renderer3.push(`<div class="tree-children svelte-1esk4n5"><!--[-->`);
				const each_array = ensure_array_like(item.children);
				for (let $$index_1 = 0, $$length = each_array.length; $$index_1 < $$length; $$index_1++) {
					let child = each_array[$$index_1];
					$$renderer3.push(`<div class="tree-node-wrapper svelte-1esk4n5">`);
					treeNode($$renderer3, child, level + 1);
					$$renderer3.push(`<!----></div>`);
				}
				$$renderer3.push(`<!--]--></div>`);
			} else {
				$$renderer3.push('<!--[!-->');
				if (expandedNodes.has(item.id) && item.nodeType === 'category') {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="tree-children empty-drop-zone svelte-1esk4n5"><span class="empty-hint svelte-1esk4n5">Drop items here</span></div>`
					);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]-->`);
			}
			$$renderer3.push(`<!--]--></div>`);
		}
		$$renderer2.push(
			`<div class="mb-4 flex flex-wrap items-center gap-2 svelte-1esk4n5"><div class="relative flex-1 min-w-[200px] svelte-1esk4n5"><iconify-icon icon="mdi:magnify" width="18" class="absolute left-3 top-1/2 -translate-y-1/2 opacity-50 svelte-1esk4n5"></iconify-icon> <input type="text" placeholder="Search collections..."${attr('value', searchText)} class="input w-full h-12 pl-10 pr-8 rounded shadow-sm svelte-1esk4n5"/> `
		);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--></div> <div class="flex gap-2 svelte-1esk4n5"><button type="button" class="btn preset-tonal hover:preset-filled transition-all shadow-sm svelte-1esk4n5" title="Expand All"><iconify-icon icon="mdi:unfold-more-horizontal" width="18" class="svelte-1esk4n5"></iconify-icon> <span class="hidden sm:inline ml-1 svelte-1esk4n5">Expand All</span></button> <button type="button" class="btn preset-tonal hover:preset-filled transition-all shadow-sm svelte-1esk4n5" title="Collapse All"><iconify-icon icon="mdi:unfold-less-horizontal" width="18" class="svelte-1esk4n5"></iconify-icon> <span class="hidden sm:inline ml-1 svelte-1esk4n5">Collapse All</span></button></div></div> <div class="collection-builder-tree relative w-full h-auto overflow-y-auto rounded p-2 svelte-1esk4n5">`
		);
		if (hierarchicalData.length === 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<div class="text-center p-8 text-surface-500 svelte-1esk4n5">`);
			{
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(
					`<iconify-icon icon="mdi:folder-open-outline" width="48" class="opacity-50 mb-2 svelte-1esk4n5"></iconify-icon> <p class="svelte-1esk4n5">No categories or collections yet</p>`
				);
			}
			$$renderer2.push(`<!--]--></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<div class="root-dnd-zone svelte-1esk4n5"><!--[-->`);
			const each_array_1 = ensure_array_like(rootItems);
			for (let $$index = 0, $$length = each_array_1.length; $$index < $$length; $$index++) {
				let item = each_array_1[$$index];
				$$renderer2.push(`<div class="tree-node-wrapper svelte-1esk4n5">`);
				treeNode($$renderer2, item, 0);
				$$renderer2.push(`<!----></div>`);
			}
			$$renderer2.push(`<!--]--></div>`);
		}
		$$renderer2.push(`<!--]--> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div>`);
	});
}
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { data } = $$props;
		let isLoading = false;
		{
			let children = function ($$renderer3) {
				if (screen.isDesktop) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<button type="button" aria-label="Add New Category" class="preset-filled-tertiary-500 btn flex w-auto min-w-[140px] items-center justify-center gap-1"${attr('disabled', isLoading, true)}><iconify-icon icon="bi:collection" width="18" class="text-white"></iconify-icon> <span>${escape_html(collection_addcategory())}</span></button> <button type="button" aria-label="Add New Collection" class="preset-filled-surface-500 btn flex w-auto min-w-[140px] items-center justify-center gap-1 rounded font-bold"${attr('disabled', isLoading, true)}><iconify-icon icon="material-symbols:category" width="18"></iconify-icon> <span>${escape_html(collection_add())}</span></button> <button type="button" aria-label="Save" class="preset-filled-primary-500 btn flex w-auto min-w-[140px] items-center justify-center gap-1"${attr('disabled', isLoading, true)}>`
					);
					{
						$$renderer3.push('<!--[!-->');
						$$renderer3.push(`<iconify-icon icon="material-symbols:save" width="24" class="text-white"></iconify-icon>`);
					}
					$$renderer3.push(`<!--]--> <span>${escape_html(button_save())}</span></button>`);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]-->`);
			};
			PageTitle($$renderer2, {
				name: collection_pagetitle(),
				icon: 'fluent-mdl2:build-definition',
				showBackButton: true,
				backUrl: '/config',
				children
			});
		}
		$$renderer2.push(`<!----> `);
		if (!screen.isDesktop) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="flex gap-2 mb-2 px-2"><button type="button" aria-label="Add New Category" class="preset-filled-tertiary-500 btn flex flex-1 items-center justify-center gap-1"${attr('disabled', isLoading, true)}><iconify-icon icon="bi:collection" width="18" class="text-white"></iconify-icon> <span>${escape_html(collection_addcategory())}</span></button> <button type="button" aria-label="Add New Collection" class="preset-filled-surface-500 btn flex flex-1 items-center justify-center gap-1 rounded font-bold"${attr('disabled', isLoading, true)}><iconify-icon icon="material-symbols:category" width="18"></iconify-icon> <span>${escape_html(collection_add())}</span></button> <button type="button" aria-label="Save" class="preset-filled-primary-500 btn flex flex-1 items-center justify-center gap-1"${attr('disabled', isLoading, true)}>`
			);
			{
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(`<iconify-icon icon="material-symbols:save" width="24" class="text-white"></iconify-icon>`);
			}
			$$renderer2.push(`<!--]--> <span>${escape_html(button_save())}</span></button></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--> <div class="max-h-[calc(100vh-65px)] overflow-auto"><div class="wrapper mb-2"><p class="mb-4 text-center dark:text-primary-500">${escape_html(collection_description())}</p> `
		);
		TreeViewBoard($$renderer2);
		$$renderer2.push(`<!----></div></div>`);
	});
}
export { _page as default };
//# sourceMappingURL=_page.svelte.js.map
