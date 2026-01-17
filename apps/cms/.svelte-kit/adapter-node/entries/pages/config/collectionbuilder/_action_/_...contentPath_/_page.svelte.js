import { d as escape_html, a as attr, e as ensure_array_like, g as attr_class, i as clsx } from '../../../../../../chunks/index5.js';
import '../../../../../../chunks/logger.js';
import axios from 'axios';
import '@sveltejs/kit/internal';
import '../../../../../../chunks/exports.js';
import '../../../../../../chunks/utils3.js';
import 'clsx';
import '@sveltejs/kit/internal/server';
import '../../../../../../chunks/state.svelte.js';
import { o as obj2formData } from '../../../../../../chunks/utils.js';
import { p as page } from '../../../../../../chunks/index6.js';
import { c as tabSet, v as validationStore, t as toaster } from '../../../../../../chunks/store.svelte.js';
import { e as collection } from '../../../../../../chunks/collectionStore.svelte.js';
import '../../../../../../chunks/UIStore.svelte.js';
import {
	T as collection_name,
	U as collection_name_tooltip1,
	V as collection_name_tooltip2,
	W as collection_name_placeholder,
	X as collection_dbname2,
	Y as collectionname_optional,
	Z as collectionname_labelicon,
	_ as collection_icon_tooltip,
	$ as collection_slug,
	a0 as collection_slug_tooltip,
	a1 as collection_slug_input,
	a2 as collectionname_description,
	a3 as collection_description,
	a4 as collection_description_placeholder,
	a5 as collection_status,
	a6 as collection_status_tooltip,
	F as button_cancel,
	a7 as button_next,
	a8 as collection_widgetfield_addrequired,
	a9 as collection_widgetfield_drag,
	aa as button_edit,
	ab as collection_widgetfield_addfields1,
	ac as button_previous,
	ad as button_save,
	ae as button_delete,
	af as collection_helptext,
	ag as collection_required,
	ah as collection_widgetfields
} from '../../../../../../chunks/_index.js';
import { I as IconifyPicker } from '../../../../../../chunks/scanner.js';
import { S as StatusTypes } from '../../../../../../chunks/definitions.js';
import '../../../../../../chunks/index7.js';
import { widgetFunctions } from '../../../../../../chunks/widgetStore.svelte.js';
import { g as get } from '../../../../../../chunks/index4.js';
import { P as PageTitle } from '../../../../../../chunks/PageTitle.js';
import { T as Tabs } from '../../../../../../chunks/anatomy3.js';
function CollectionForm($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		page.params.action;
		let searchQuery = '';
		let selectedIcon = props.data?.icon || '';
		let name = props.data?.name ?? '';
		let slug = props.data?.slug ?? '';
		let description = props.data?.description ?? '';
		let status = props.data?.status ?? 'unpublished';
		const DBName = name ? name.toLowerCase().replace(/ /g, '_') : '';
		const statuses = Object.values(StatusTypes);
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			$$renderer3.push(
				`<div class="flex w-full flex-col"><div class="flex flex-col gap-2 rounded border p-4"><div class="flex flex-col"><label for="name" class="mb-1 flex items-center font-medium">${escape_html(collection_name())} <span class="mx-1 text-error-500">*</span> <iconify-icon icon="material-symbols:info"${attr('title', `${collection_name_tooltip1()} ${collection_name_tooltip2()}`)} width="18" class="ml-1 cursor-pointer text-tertiary-500 dark:text-primary-500"></iconify-icon></label> <input type="text" required id="name" name="name" data-testid="collection-name-input"${attr('value', name)}${attr('placeholder', collection_name_placeholder())}${attr('aria-label', collection_name())} class="input w-full text-black dark:text-primary-500"/> `
			);
			if (name) {
				$$renderer3.push('<!--[-->');
				$$renderer3.push(
					`<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">${escape_html(collection_dbname2())} <span class="font-bold text-tertiary-500 dark:text-primary-500">${escape_html(DBName)}</span></p>`
				);
			} else {
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(
				`<!--]--></div> <hr class="my-2 border-gray-300 dark:border-gray-600"/> <p class="base-font-color mb-0 text-center font-bold">${escape_html(collectionname_optional())}:</p> <div class="flex flex-col"><label for="icon" class="mb-1 flex items-center font-medium">${escape_html(collectionname_labelicon())} <iconify-icon icon="material-symbols:info"${attr('title', collection_icon_tooltip())} width="18" class="ml-1 cursor-pointer text-tertiary-500 dark:text-primary-500"></iconify-icon></label> `
			);
			IconifyPicker($$renderer3, {
				get iconselected() {
					return selectedIcon;
				},
				set iconselected($$value) {
					selectedIcon = $$value;
					$$settled = false;
				},
				get searchQuery() {
					return searchQuery;
				},
				set searchQuery($$value) {
					searchQuery = $$value;
					$$settled = false;
				}
			});
			$$renderer3.push(
				`<!----></div> <div class="flex flex-col"><label for="slug" class="mb-1 flex items-center font-medium">${escape_html(collection_slug())} <iconify-icon icon="material-symbols:info"${attr('title', collection_slug_tooltip())} width="18" class="ml-1 cursor-pointer text-tertiary-500 dark:text-primary-500"></iconify-icon></label> <input type="text" id="slug"${attr('value', slug)}${attr('placeholder', collection_slug_input())} class="input w-full text-black dark:text-primary-500"/></div> <div class="flex flex-col"><label for="description" class="mb-1 flex items-center font-medium">${escape_html(collectionname_description())} <iconify-icon icon="material-symbols:info"${attr('title', collection_description())} width="18" class="ml-1 cursor-pointer text-tertiary-500 dark:text-primary-500"></iconify-icon></label> <textarea id="description" rows="2"${attr('placeholder', collection_description_placeholder())} class="input w-full text-black dark:text-primary-500">`
			);
			const $$body = escape_html(description);
			if ($$body) {
				$$renderer3.push(`${$$body}`);
			}
			$$renderer3.push(
				`</textarea></div> <div class="flex flex-col"><label for="status" class="mb-1 flex items-center font-medium">${escape_html(collection_status())} <iconify-icon icon="material-symbols:info"${attr('title', collection_status_tooltip())} width="18" class="ml-1 cursor-pointer text-tertiary-500 dark:text-primary-500"></iconify-icon></label> `
			);
			$$renderer3.select(
				{
					id: 'status',
					value: status,
					class: 'select w-full text-black dark:text-primary-500'
				},
				($$renderer4) => {
					$$renderer4.push(`<!--[-->`);
					const each_array = ensure_array_like(statuses);
					for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
						let statusOption = each_array[$$index];
						$$renderer4.option({ value: statusOption }, ($$renderer5) => {
							$$renderer5.push(`${escape_html(statusOption)}`);
						});
					}
					$$renderer4.push(`<!--]-->`);
				}
			);
			$$renderer3.push(
				`</div></div> <div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between"><a href="/config/collectionbuilder" class="preset-outlined-secondary-500 btn sm:w-auto">${escape_html(button_cancel())}</a> <button type="button" class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500 sm:w-auto">${escape_html(button_next())}</button></div></div>`
			);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer2.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer2.subsume($$inner_renderer);
	});
}
function VerticalList($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { headers = [], children } = $$props;
		const gridClass = `grid grid-cols-${headers.length + 1} preset-outlined-tertiary-500 dark:preset-outlined-primary-500 w-full items-start justify-start p-1 py-2 pl-3 text-center font-semibold`;
		$$renderer2.push(`<div class="h-full overflow-y-auto">`);
		if (headers.length > 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<div${attr_class(clsx(gridClass))}><!--[-->`);
			const each_array = ensure_array_like(headers);
			for (let index = 0, $$length = each_array.length; index < $$length; index++) {
				let header = each_array[index];
				$$renderer2.push(`<div class="ml-2 text-left">${escape_html(header)}:</div>`);
			}
			$$renderer2.push(`<!--]--></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> <section class="my-1 w-full">`);
		children?.($$renderer2);
		$$renderer2.push(`<!----></section></div>`);
	});
}
function CollectionWidget($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const contentPath = page.params.contentPath;
		function mapFieldsWithWidgets(fields2) {
			if (!fields2) return [];
			return fields2.map((field, index) => {
				const widgetType =
					field.widget?.key || // For new widgets
					field.widget?.Name || // For existing widgets
					field.__type || // For schema-defined widgets
					field.type || // Backup type field
					Object.keys(get(widgetFunctions)).find((key) => field[key]) || // Check if field has widget property
					'Unknown Widget';
				return {
					id: index + 1,
					...field,
					widget: { key: widgetType, Name: widgetType, ...field.widget }
				};
			});
		}
		let fields = mapFieldsWithWidgets(props.fields ?? []);
		const headers = ['Id', 'Icon', 'Name', 'DBName', 'Widget'];
		$$renderer2.push(
			`<div class="flex w-full flex-col"><div class="preset-outlined-tertiary-500 rounded-t-md p-2 text-center dark:preset-outlined-primary-500"><p>${escape_html(collection_widgetfield_addrequired())} <span class="text-tertiary-500 dark:text-primary-500">${escape_html(contentPath)}</span> Collection inputs.</p> <p class="mb-2">${escape_html(collection_widgetfield_drag())}</p></div> <div style="max-height: 55vh !important;">`
		);
		VerticalList($$renderer2, {
			headers,
			children: ($$renderer3) => {
				$$renderer3.push(`<!--[-->`);
				const each_array = ensure_array_like(fields);
				for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
					let field = each_array[$$index];
					$$renderer3.push(
						`<div class="border-blue preset-outlined-surface-500 my-2 grid w-full grid-cols-6 items-center rounded-md border p-1 text-left hover:preset-filled-surface-500 dark:text-white"><div class="preset-ghost-tertiary-500 badge h-10 w-10 rounded-full dark:preset-ghost-primary-500">${escape_html(field.id)}</div> <iconify-icon${attr('icon', field.icon)} width="24" class="text-tertiary-500"></iconify-icon> <div class="font-bold dark:text-primary-500">${escape_html(field.label)}</div> <div>${escape_html(field?.db_fieldName ? field.db_fieldName : '-')}</div> <div>${escape_html(field.widget?.key || field.__type || 'Unknown Widget')}</div> <button type="button"${attr('aria-label', button_edit())} class="preset-ghost-primary-500 btn-icon ml-auto"><iconify-icon icon="ic:baseline-edit" width="24" class="dark:text-white"></iconify-icon></button></div>`
					);
				}
				$$renderer3.push(`<!--]-->`);
			}
		});
		$$renderer2.push(
			`<!----></div> <div><div class="mt-2 flex items-center justify-center gap-3"><button class="preset-filled-tertiary-500 btn"${attr('aria-label', collection_widgetfield_addfields1())} data-testid="add-field-button">${escape_html(collection_widgetfield_addfields1())}</button></div> <div class="flex items-center justify-between"><button type="button"${attr('aria-label', button_previous())} class="preset-filled-secondary-500 btn mt-2 justify-end">${escape_html(button_previous())}</button> <button type="button"${attr('aria-label', button_save())} class="preset-filled-tertiary-500 btn mt-2 justify-end dark:preset-filled-primary-500 dark:text-black">${escape_html(button_save())}</button></div></div></div>`
		);
	});
}
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let localTabSet = String(tabSet.value);
		page.params.contentPath;
		const action = page.params.action;
		const { data } = $$props;
		let originalName = '';
		const collectionValue = collection.value;
		let pageTitle = '';
		let highlightedPart = '';
		function handlePageTitleUpdate(title) {
			highlightedPart = title;
			if (action === 'edit') {
				pageTitle = `Edit ${highlightedPart} Collection`;
			} else {
				pageTitle = `Create ${highlightedPart} Collection`;
			}
		}
		async function handleCollectionSave() {
			const currentCollection = collection.value;
			const currentName = String(currentCollection?.name || '');
			if (validationStore.errors && Object.keys(validationStore.errors).length > 0) {
				toaster.error({ description: 'Please fix validation errors before saving' });
				return;
			}
			const data2 =
				action == 'edit'
					? obj2formData({
							originalName,
							name: currentName,
							icon: currentCollection?.icon,
							status: currentCollection?.status,
							slug: currentCollection?.slug,
							description: currentCollection?.description,
							permissions: currentCollection?.permissions,
							fields: currentCollection?.fields
						})
					: obj2formData({
							name: currentName,
							icon: currentCollection?.icon,
							status: currentCollection?.status,
							slug: currentCollection?.slug,
							description: currentCollection?.description,
							permissions: currentCollection?.permissions,
							fields: currentCollection?.fields
						});
			const resp = await axios.post(`?/saveCollection`, data2, { headers: { 'Content-Type': 'multipart/form-data' } });
			if (resp.data.status === 200) {
				toaster.success({
					description: "Collection Saved. You're all set to build your content."
				});
			}
		}
		$$renderer2.push(`<div class="my-2 flex items-center justify-between gap-2">`);
		PageTitle($$renderer2, {
			name: pageTitle,
			highlight: highlightedPart,
			icon: 'ic:baseline-build'
		});
		$$renderer2.push(
			`<!----> <button type="button" aria-label="Back" class="preset-outlined-primary-500 btn-icon"><iconify-icon icon="ri:arrow-left-line" width="20"></iconify-icon></button></div> <div class="wrapper">`
		);
		if (action == 'edit') {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="flex justify-center gap-3"><button type="button" class="preset-filled-error-500 btn mb-3 mr-1 mt-1 justify-end dark:preset-filled-error-500 dark:text-black">${escape_html(button_delete())}</button> <button type="button" class="preset-filled-tertiary-500 btn mb-3 mr-1 mt-1 justify-end dark:preset-filled-tertiary-500 dark:text-black">${escape_html(button_save())}</button></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--> <p class="mb-2 hidden text-center text-tertiary-500 dark:text-primary-500 sm:block">${escape_html(collection_helptext())}</p> <div class="mb-2 text-center text-xs text-error-500" data-testid="required-indicator">* ${escape_html(collection_required())}</div> `
		);
		Tabs($$renderer2, {
			value: localTabSet,
			onValueChange: (e) => (localTabSet = e.value),
			children: ($$renderer3) => {
				$$renderer3.push(`<!---->`);
				Tabs.List($$renderer3, {
					class: 'flex border-b border-surface-200-800 mb-4',
					children: ($$renderer4) => {
						if (page.data.isAdmin) {
							$$renderer4.push('<!--[-->');
							$$renderer4.push(`<!---->`);
							Tabs.Trigger($$renderer4, {
								value: '0',
								children: ($$renderer5) => {
									$$renderer5.push(
										`<div class="flex items-center gap-1 py-2 px-4"><iconify-icon icon="ic:baseline-edit" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon> <span${attr_class(
											'',
											void 0,
											{
												active: tabSet.value === 0,
												'text-tertiary-500': tabSet.value === 0,
												'text-primary-500': tabSet.value === 0
											}
										)}>${escape_html(button_edit())}</span></div>`
									);
								},
								$$slots: { default: true }
							});
							$$renderer4.push(`<!----> <!---->`);
							Tabs.Trigger($$renderer4, {
								value: '1',
								'data-testid': 'widget-fields-tab',
								children: ($$renderer5) => {
									$$renderer5.push(
										`<div class="flex items-center gap-1 py-2 px-4"><iconify-icon icon="mdi:widgets-outline" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon> <span${attr_class(
											'',
											void 0,
											{
												active: tabSet.value === 1,
												'text-tertiary-500': tabSet.value === 2,
												'text-primary-500': tabSet.value === 2
											}
										)}>${escape_html(collection_widgetfields())}</span></div>`
									);
								},
								$$slots: { default: true }
							});
							$$renderer4.push(`<!---->`);
						} else {
							$$renderer4.push('<!--[!-->');
						}
						$$renderer4.push(`<!--]-->`);
					},
					$$slots: { default: true }
				});
				$$renderer3.push(`<!----> <!---->`);
				Tabs.Content($$renderer3, {
					value: '0',
					children: ($$renderer4) => {
						CollectionForm($$renderer4, { data: collectionValue, handlePageTitleUpdate });
					},
					$$slots: { default: true }
				});
				$$renderer3.push(`<!----> <!---->`);
				Tabs.Content($$renderer3, {
					value: '1',
					children: ($$renderer4) => {
						CollectionWidget($$renderer4, { fields: collectionValue?.fields, handleCollectionSave });
					},
					$$slots: { default: true }
				});
				$$renderer3.push(`<!---->`);
			},
			$$slots: { default: true }
		});
		$$renderer2.push(`<!----></div>`);
	});
}
export { _page as default };
//# sourceMappingURL=_page.svelte.js.map
