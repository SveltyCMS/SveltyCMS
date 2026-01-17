import { h as bind_props, g as attr_class, e as ensure_array_like, a as attr, d as escape_html } from './index5.js';
import './runtime.js';
import { a as app } from './store.svelte.js';
function Input($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { field, value = void 0, error } = $$props;
		if (!value) {
			value = [];
		}
		let draggedItem = null;
		let dragOverIndex = null;
		const lang = app.contentLanguage;
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			$$renderer3.push(
				`<div class="space-y-4"><div class="flex items-center justify-between border-b border-surface-200 pb-3 dark:text-surface-50"><h3 class="text-lg font-semibold text-surface-900 dark:text-surface-100">Menu Structure</h3> <button type="button" class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500"><iconify-icon icon="mdi:plus" width="16"></iconify-icon> Add Menu Item</button></div> <div${attr_class(
					'mmin-h-[200px] space-y-2',
					void 0,
					{
						flex: !value || value.length === 0,
						'items-center': !value || value.length === 0,
						'justify-center': !value || value.length === 0
					}
				)}>`
			);
			if (value && value.length > 0) {
				$$renderer3.push('<!--[-->');
				$$renderer3.push(`<!--[-->`);
				const each_array = ensure_array_like(value);
				for (let index = 0, $$length = each_array.length; index < $$length; index++) {
					let item = each_array[index];
					$$renderer3.push(
						`<div${attr_class(
							'rounded-lg border border-surface-200 bg-surface-50/50 transition-all duration-200 dark:text-surface-50 dark:bg-surface-800/50',
							void 0,
							{
								'scale-95': draggedItem?._id === item._id,
								'opacity-50': draggedItem?._id === item._id,
								'!border-primary-400': dragOverIndex === index,
								'!bg-primary-500': dragOverIndex === index,
								'dark:!border-primary-600': dragOverIndex === index,
								'dark:!bg-primary-900': dragOverIndex === index
							}
						)}${attr('draggable', field.defaults?.enableDragDrop !== false)} role="listitem"><div class="flex items-center gap-3 p-3"><div class="flex items-center gap-1">`
					);
					if (field.defaults?.enableDragDrop !== false) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<div class="cursor-move p-1 text-surface-400 transition-colors hover:text-surface-600 dark:text-surface-500 dark:hover:text-surface-300" aria-label="Drag to reorder"><iconify-icon icon="mdi:drag" width="16"></iconify-icon></div>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--> `);
					if (item.children.length > 0 && field.defaults?.enableExpandCollapse !== false) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<button type="button" class="preset-filled-surface-500 btn"${attr('aria-expanded', item._expanded !== false)}${attr('aria-label', item._expanded !== false ? 'Collapse children' : 'Expand children')}><iconify-icon icon="mdi:chevron-down" width="16"${attr_class('chevron transition-transform duration-200', void 0, { '-rotate-90': item._expanded === false })}></iconify-icon></button>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
						if (item.children.length === 0) {
							$$renderer3.push('<!--[-->');
							$$renderer3.push(`<div class="spacer w-8"></div>`);
						} else {
							$$renderer3.push('<!--[!-->');
						}
						$$renderer3.push(`<!--]-->`);
					}
					$$renderer3.push(
						`<!--]--></div> <div class="min-w-0 flex-1"><span class="truncate font-medium text-surface-900 dark:text-surface-100">${escape_html(item._fields?.title?.[lang] || item._fields?.title?.en || 'Untitled Item')}</span> `
					);
					if (item.children.length > 0) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<span class="ml-2 text-xs text-surface-500 dark:text-surface-50">(${escape_html(item.children.length)} children)</span>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--></div> <div class="flex items-center gap-1">`);
					if (field.fields && field.fields.length > 1) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<button type="button" class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500" aria-label="Add child item" title="Add child item"><iconify-icon icon="mdi:plus" width="14"></iconify-icon></button>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(
						`<!--]--> <button type="button" class="abtn preset-filled-surface-500" aria-label="Edit item" title="Edit item"><iconify-icon icon="mdi:pencil" width="14"></iconify-icon></button> <button type="button" class="preset-filled-error-500 btn" aria-label="Delete item" title="Delete item"><iconify-icon icon="mdi:delete" width="14"></iconify-icon></button></div></div> `
					);
					if (item.children.length > 0 && item._expanded !== false) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`<div class="ml-8 border-l-2 border-surface-200 pl-4 dark:text-surface-50">`);
						Input($$renderer3, {
							field,
							error,
							get value() {
								return item.children;
							},
							set value($$value) {
								item.children = $$value;
								$$settled = false;
							}
						});
						$$renderer3.push(`<!----></div>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--></div>`);
				}
				$$renderer3.push(`<!--]-->`);
			} else {
				$$renderer3.push('<!--[!-->');
				$$renderer3.push(
					`<div class="py-8 text-center"><iconify-icon icon="mdi:menu" width="48" class="empty-icon mb-4 text-surface-300 dark:text-surface-600"></iconify-icon> <p class="empty-message text-surface-500 dark:text-surface-50">No menu items yet. Click "Add Menu Item" to get started.</p></div>`
				);
			}
			$$renderer3.push(`<!--]--></div> `);
			if (error) {
				$$renderer3.push('<!--[-->');
				$$renderer3.push(
					`<div class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300" role="alert" aria-live="polite"><iconify-icon icon="mdi:alert-circle" width="16"></iconify-icon> ${escape_html(error)}</div>`
				);
			} else {
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]--></div>`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer2.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer2.subsume($$inner_renderer);
		bind_props($$props, { value });
	});
}
export { Input as default };
//# sourceMappingURL=Input6.js.map
