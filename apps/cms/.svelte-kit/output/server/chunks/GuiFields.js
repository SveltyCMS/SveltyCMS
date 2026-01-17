import { g as attr_class, d as escape_html, i as clsx, h as bind_props, e as ensure_array_like, a as attr, c as stringify } from './index5.js';
import { P as PageTitle } from './PageTitle.js';
import { twMerge } from 'tailwind-merge';
import { widgets } from './widgetStore.svelte.js';
import './UIStore.svelte.js';
import './screenSizeStore.svelte.js';
import './utils.js';
import { al as widgetbuilder_addcolectionfield5 } from './_index.js';
function DropDown($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const {
			items,
			// Array of selectable items
			selected,
			// Currently selected item (no default here, handled dynamically)
			label = '',
			// Optional label for the dropdown
			class: className = ''
			// Custom class for the dropdown container
		} = $$props;
		let expanded = false;
		let currentSelected = selected;
		items.filter((item) => item !== currentSelected);
		$$renderer2.push(
			`<div${attr_class(
				clsx(
					// Effect to update currentSelected when the selected prop changes
					twMerge('overflow-hidden bg-surface-500', className)
				)
			)}><button${attr_class('preset-filled-tertiary-500 btn dark:preset-outlined-primary-500', void 0, { selected: expanded })} aria-label="Toggle Dropdown">${escape_html(currentSelected || label)}</button></div> `
		);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function AddWidget($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let {
			fields = [],
			addField = false,
			editField = false,
			selected_widget = null,
			field = {
				label: '',
				db_fieldName: '',
				translated: false,
				required: false,
				widget: { key: null, GuiFields: {} }
			}
		} = $$props;
		const widget_keys = Object.keys(widgets.widgetFunctions);
		$$renderer2.push(
			`<div class="fixed -top-16 left-0 flex h-screen w-full flex-col overflow-auto bg-white dark:bg-surface-900"><div class="mb-3 flex items-center justify-between text-surface-900 dark:text-white">`
		);
		PageTitle($$renderer2, {
			name: 'Add a Widget',
			icon: 'material-symbols:ink-pen',
			iconColor: 'text-tertiary-500 dark:text-primary-500'
		});
		$$renderer2.push(
			`<!----> <button type="button" aria-label="Cancel" class="preset-outlined-secondary-500 btn-icon mr-2"><iconify-icon icon="material-symbols:close" width="24"></iconify-icon></button></div> `
		);
		if (!selected_widget && !editField) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="flex items-center justify-center"><button type="button" aria-label="Cancel" class="mb-[20px] ml-auto mr-[40px]">X</button> `
			);
			DropDown($$renderer2, {
				items: widget_keys,
				selected: selected_widget,
				label: 'Select Widget'
			});
			$$renderer2.push(`<!----></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(
				`<div class="flex-col items-center justify-center overflow-auto"><p class="text-wxl mb-3 text-center">Define your <span class="text-tertiary-500 dark:text-primary-500">${escape_html(selected_widget)}</span></p> <div class="w-100 mx-2 mb-2 flex justify-between gap-2"><button class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500">Save ${escape_html(selected_widget)} Widget</button> <button class="variant-filled-secondary btn dark:preset-outlined-secondary-500">Cancel</button></div> `
			);
			{
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--></div>`);
		}
		$$renderer2.push(`<!--]--></div>`);
		bind_props($$props, { fields, addField, editField, selected_widget, field });
	});
}
function WidgetFields($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { fields = [] } = $$props;
		$$renderer2.push(`<div class="wrapper"><!--[-->`);
		const each_array = ensure_array_like(
			// Any side effects related to currentFieldKey changes
			fields
		);
		for (let index = 0, $$length = each_array.length; index < $$length; index++) {
			let field = each_array[index];
			$$renderer2.push(
				`<div class="field relative" aria-label="Widget" role="button" tabindex="0"${attr('data-index', index)}><div class="h-full w-full p-[10px]"><p>widget: ${escape_html(field.widget.Name)}</p> <p>label: ${escape_html(field.label)}</p></div> <button aria-label="Delete widget" class="absolute right-[5px] top-[5px]"><iconify-icon icon="tdesign:delete-1" width="24" height="24"></iconify-icon></button></div>`
			);
		}
		$$renderer2.push(`<!--]--></div> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function WidgetBuilder($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { addField = false, fields = [], onFieldsChange } = $$props;
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			$$renderer3.push(`<div class="flex flex-col">`);
			if (addField) {
				$$renderer3.push('<!--[-->');
				AddWidget($$renderer3, {
					get fields() {
						return fields;
					},
					set fields($$value) {
						fields = $$value;
						$$settled = false;
					},
					get addField() {
						return addField;
					},
					set addField($$value) {
						addField = $$value;
						$$settled = false;
					}
				});
			} else {
				$$renderer3.push('<!--[!-->');
				$$renderer3.push(
					`<button class="preset-filled-tertiary-500 btn mb-4 mt-1 dark:preset-filled-primary-500">${escape_html(widgetbuilder_addcolectionfield5())}</button> `
				);
				WidgetFields($$renderer3, { fields });
				$$renderer3.push(`<!---->`);
			}
			$$renderer3.push(`<!--]--></div>`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer2.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer2.subsume($$inner_renderer);
		bind_props($$props, { addField, fields });
	});
}
function GuiFields($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { value = [] } = $$props;
		if (!value || value.length === 0) {
			value = [[]];
		}
		function updateLevelFields(index, newFields) {
			value[index] = newFields;
			value = [...value];
		}
		$$renderer2.push(
			`<div class="space-y-6"><div class="border-b border-surface-200 pb-4 dark:text-surface-50"><h3 class="mb-2 text-lg font-semibold text-surface-900 dark:text-surface-100">Menu Structure Configuration</h3> <p class="text-sm leading-relaxed text-surface-600 dark:text-surface-300">Define the fields available at each level of your hierarchical menu. Each level can have different widgets and configurations.</p></div> <div class="levels-container space-y-4"><!--[-->`
		);
		const each_array = ensure_array_like(value);
		for (let levelIndex = 0, $$length = each_array.length; levelIndex < $$length; levelIndex++) {
			let levelFields = each_array[levelIndex];
			$$renderer2.push(
				`<div${attr_class(`level-card rounded-lg border border-surface-200 bg-surface-50/50 dark:text-surface-50 dark:bg-surface-800/50 ${stringify(levelIndex === 0 ? 'border-primary-200! bg-primary-50/30! dark:border-primary-700! dark:bg-primary-900/20!' : '')}`)}><div class="level-header flex items-center justify-between border-b border-surface-200 bg-surface-100/50 p-4 dark:text-surface-50 dark:bg-surface-800"><div class="level-info flex items-center gap-3"><h4 class="level-title text-base font-medium text-surface-800 dark:text-surface-100">Level ${escape_html(levelIndex + 1)}</h4> `
			);
			if (levelIndex === 0) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<span class="level-badge rounded-full bg-primary-100 px-2 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900 dark:text-primary-200">Root Level</span>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(
					`<span class="level-badge rounded-full bg-secondary-100 px-2 py-1 text-xs font-medium text-secondary-700 dark:bg-secondary-900 dark:text-secondary-200">Nested Level</span>`
				);
			}
			$$renderer2.push(`<!--]--></div> `);
			if (value.length > 1) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<button type="button" class="preset-filled-error-500 btn"${attr('aria-label', `Remove level ${stringify(levelIndex + 1)}`)} title="Remove this menu level"><iconify-icon icon="mdi:close" width="16"></iconify-icon></button>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(
				`<!--]--></div> <div class="space-y-4 p-4"><div class="space-y-3"><label class="block text-sm font-medium text-surface-700 dark:text-surface-200"${attr('for', 'widget-builder-' + levelIndex)}>Fields for Level ${escape_html(levelIndex + 1)} <span class="field-count font-normal text-surface-500 dark:text-surface-50">(${escape_html(levelFields.length)} field${escape_html(levelFields.length !== 1 ? 's' : '')})</span></label> `
			);
			WidgetBuilder($$renderer2, {
				fields: levelFields,
				onFieldsChange: (newFields) => updateLevelFields(levelIndex, newFields)
			});
			$$renderer2.push(`<!----></div> `);
			if (levelFields.length === 0) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<div class="empty-fields-notice flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-surface-300 bg-surface-100/50 p-6 text-center dark:border-surface-600 dark:bg-surface-800/50"><iconify-icon icon="mdi:information-outline" width="20" class="text-surface-400"></iconify-icon> <span class="text-sm font-medium text-surface-600 dark:text-surface-300">No fields configured for this level yet.</span> <span class="text-xs text-surface-500 dark:text-surface-50">Use the Widget Builder above to add fields.</span></div>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--></div></div>`);
		}
		$$renderer2.push(
			`<!--]--></div> <div class="border-t border-surface-200 pt-4 dark:text-surface-50"><button type="button" class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500"><iconify-icon icon="mdi:plus" width="20"></iconify-icon> Add Menu Level</button></div></div>`
		);
		bind_props($$props, { value });
	});
}
export { GuiFields as default };
//# sourceMappingURL=GuiFields.js.map
