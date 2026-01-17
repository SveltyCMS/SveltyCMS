import {
	e as ensure_array_like,
	g as attr_class,
	a as attr,
	c as stringify,
	d as escape_html,
	h as bind_props,
	b as attr_style,
	j as getContext,
	q as spread_props,
	n as setContext
} from '../../../chunks/index5.js';
import { g as goto } from '../../../chunks/client2.js';
import axios from 'axios';
import '../../../chunks/UIStore.svelte.js';
import { g as globalLoadingStore, l as loadingOperations } from '../../../chunks/loadingStore.svelte.js';
import { logger } from '../../../chunks/logger.js';
import '../../../chunks/schemas.js';
import { M as MediaType } from '../../../chunks/mediaModels.js';
import { P as PageTitle } from '../../../chunks/PageTitle.js';
import { f as formatBytes } from '../../../chunks/utils.js';
import { t as toaster } from '../../../chunks/store.svelte.js';
import { T as Tooltip } from '../../../chunks/anatomy2.js';
import { P as Portal } from '../../../chunks/anatomy.js';
import { T as TableFilter } from '../../../chunks/TableFilter.js';
import { T as TableIcons } from '../../../chunks/TableIcons.js';
import { T as TablePagination } from '../../../chunks/TablePagination.js';
import { o as onDestroy } from '../../../chunks/index-server.js';
import { i as imageEditorStore } from '../../../chunks/imageEditorStore.svelte.js';
import Konva from 'konva';
import { c as showConfirm, m as modalState } from '../../../chunks/modalUtils.js';
import { mediaUrl } from '../../../chunks/mediaUtils.js';
function Breadcrumb($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { breadcrumb, maxVisible = 5 } = $$props;
		let showAll = false;
		const needsTruncation = breadcrumb.length > maxVisible && !showAll;
		const visibleBreadcrumb = () => {
			if (!needsTruncation || showAll) {
				return breadcrumb;
			}
			return [breadcrumb[0], '...', ...breadcrumb.slice(-2)];
		};
		const visibleIndices = () => {
			if (!needsTruncation || showAll) {
				return breadcrumb.map((_, i) => i);
			}
			return [
				0,
				-1,
				// Ellipsis
				breadcrumb.length - 2,
				breadcrumb.length - 1
			];
		};
		$$renderer2.push(
			`<nav aria-label="Breadcrumb navigation" class="flex items-center gap-2"><ol class="flex flex-wrap items-center gap-1 text-sm text-gray-700 dark:text-gray-300" role="list"><!--[-->`
		);
		const each_array = ensure_array_like(visibleBreadcrumb());
		for (let visibleIndex = 0, $$length = each_array.length; visibleIndex < $$length; visibleIndex++) {
			let crumb = each_array[visibleIndex];
			const actualIndex = visibleIndices()[visibleIndex];
			const isLast = visibleIndex === visibleBreadcrumb().length - 1;
			const isEllipsis = actualIndex === -1;
			$$renderer2.push(`<li class="flex items-center" role="listitem">`);
			if (isEllipsis) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<button class="flex items-center gap-1 rounded px-2 py-1 text-sm transition-colors hover:bg-surface-100 focus:bg-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:hover:bg-surface-800 dark:focus:bg-surface-800" aria-label="Show all breadcrumb items" type="button"><iconify-icon icon="mdi:dots-horizontal" width="18" class="text-surface-500" aria-hidden="true"></iconify-icon></button>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(
					`<button${attr_class(`flex items-center gap-1.5 rounded px-2 py-1 text-sm transition-all ${stringify(isLast ? 'font-semibold text-primary-600 dark:text-primary-400' : 'hover:bg-surface-100 hover:text-primary-500 focus:bg-surface-100 focus:text-primary-500 dark:hover:bg-surface-800 dark:focus:bg-surface-800')} focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1`)}${attr('aria-current', isLast ? 'page' : void 0)} type="button"${attr('title', crumb)}>`
				);
				if (actualIndex === 0) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<iconify-icon icon="mdi:home" width="18" class="shrink-0 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon> <span class="max-w-[150px] truncate">${escape_html(crumb)}</span>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
					$$renderer2.push(
						`<iconify-icon icon="mdi:folder" width="18" class="shrink-0 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon> <span class="max-w-[150px] truncate">${escape_html(crumb)}</span>`
					);
				}
				$$renderer2.push(`<!--]--></button>`);
			}
			$$renderer2.push(`<!--]--> `);
			if (!isLast) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<span class="mx-1 text-gray-400 dark:text-gray-600" aria-hidden="true"><iconify-icon icon="mdi:chevron-right" width="16"></iconify-icon></span>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--></li>`);
		}
		$$renderer2.push(
			`<!--]--></ol> <button class="btn-icon btn-icon-sm preset-outlined-surface-500 ml-auto" title="Copy path to clipboard" aria-label="Copy current path to clipboard" type="button"><iconify-icon icon="mdi:content-copy" width="16"></iconify-icon></button> <div class="sr-only" role="status" aria-live="polite">Current location: ${escape_html(breadcrumb.join(', then '))}</div></nav>`
		);
	});
}
function TagEditorModal($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { show = void 0, file = null, onUpdate = () => {} } = $$props;
		let newTagInput = '';
		let isGenerating = false;
		let isSaving = false;
		function getImageUrl(file2) {
			const thumbs = file2.thumbnails || {};
			if ('sm' in thumbs) return thumbs.sm.url;
			if ('thumbnail' in thumbs) return thumbs.thumbnail.url;
			if ('md' in thumbs) return thumbs.md.url;
			return file2.url;
		}
		if (show && file) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" tabindex="-1"><div class="card w-full max-w-lg p-4 bg-surface-100 dark:bg-surface-800 shadow-xl m-4" role="document"><header class="flex justify-between items-center mb-4"><h3 class="h3 font-bold">Manage Tags</h3> <button class="btn-icon btn-icon-sm" aria-label="Close Modal"><iconify-icon icon="mdi:close" width="24"></iconify-icon></button></header> <div class="space-y-4 max-h-[60vh] overflow-y-auto p-1"><div class="flex items-center gap-3 p-2 bg-surface-200 dark:bg-surface-700 rounded"><img${attr('src', getImageUrl(file))} alt="Thumbnail" class="w-12 h-12 object-cover rounded bg-black"/> <div class="text-sm truncate"><div class="font-bold truncate">${escape_html(file.filename)}</div> <div class="opacity-70 text-xs">${escape_html(file.mimeType)}</div></div></div> <section class="p-3 border border-primary-500/30 rounded bg-primary-50/50 dark:bg-primary-900/10"><div class="flex justify-between items-center mb-2"><span class="text-sm font-bold flex items-center gap-1 text-primary-600 dark:text-primary-400"><iconify-icon icon="mdi:robot-excited-outline"></iconify-icon> AI / Pending Tags</span> `
			);
			if (!file.metadata?.aiTags?.length) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<button class="btn btn-sm variant-filled-secondary"${attr('disabled', isGenerating, true)}>`);
				{
					$$renderer2.push('<!--[!-->');
					$$renderer2.push(`<iconify-icon icon="mdi:magic-staff"></iconify-icon> <span>Generate</span>`);
				}
				$$renderer2.push(`<!--]--></button>`);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--></div> <div class="flex flex-wrap gap-2 mb-3">`);
			if (file.metadata?.aiTags?.length) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<!--[-->`);
				const each_array = ensure_array_like(file.metadata.aiTags);
				for (let i = 0, $$length = each_array.length; i < $$length; i++) {
					let tag = each_array[i];
					{
						$$renderer2.push('<!--[!-->');
						$$renderer2.push(
							`<button class="badge variant-filled-secondary flex items-center gap-1 cursor-pointer hover:ring-2 hover:ring-secondary-300">${escape_html(tag)} <span role="button" tabindex="0" aria-label="Remove Tag"><iconify-icon icon="mdi:close" width="14"></iconify-icon></span></button>`
						);
					}
					$$renderer2.push(`<!--]-->`);
				}
				$$renderer2.push(`<!--]-->`);
			} else {
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(`<div class="text-xs opacity-60 italic">No pending tags.</div>`);
			}
			$$renderer2.push(
				`<!--]--></div> <div class="flex gap-2"><input class="input input-sm flex-1" type="text" placeholder="Add tag manually..."${attr('value', newTagInput)}/> <button class="btn btn-sm variant-filled-surface"${attr('disabled', !newTagInput.trim(), true)} aria-label="Add Tag"><iconify-icon icon="mdi:plus"></iconify-icon></button></div> `
			);
			if (file.metadata?.aiTags?.length) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<div class="mt-3 pt-3 border-t border-primary-500/20"><button class="btn btn-sm variant-filled-success w-full"${attr('disabled', isSaving, true)}><iconify-icon icon="mdi:check-all"></iconify-icon> <span>Save All to Media Tags</span></button></div>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(
				`<!--]--></section> <section class="p-3 border border-surface-300 dark:border-surface-600 rounded bg-surface-50 dark:bg-surface-900"><div class="mb-2 text-sm font-bold opacity-80">Saved Tags</div> <div class="flex flex-wrap gap-2">`
			);
			if (file.metadata?.tags?.length) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<!--[-->`);
				const each_array_1 = ensure_array_like(file.metadata.tags);
				for (let i = 0, $$length = each_array_1.length; i < $$length; i++) {
					let tag = each_array_1[i];
					{
						$$renderer2.push('<!--[!-->');
						$$renderer2.push(
							`<button class="badge variant-filled-surface flex items-center gap-1 cursor-pointer hover:ring-2 hover:ring-surface-400">${escape_html(tag)} <span role="button" tabindex="0" aria-label="Remove Tag"><iconify-icon icon="mdi:close" width="14"></iconify-icon></span></button>`
						);
					}
					$$renderer2.push(`<!--]-->`);
				}
				$$renderer2.push(`<!--]-->`);
			} else {
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(`<div class="text-xs opacity-60 italic">No saved tags.</div>`);
			}
			$$renderer2.push(`<!--]--></div></section></div></div></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]-->`);
		bind_props($$props, { show, file });
	});
}
function MediaGrid($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const {
			filteredFiles = [],
			gridSize = 'medium',
			ondeleteImage = () => {},
			onBulkDelete = () => {},
			onEditImage = () => {},
			onsizechange = () => {},
			onUpdateImage = () => {}
		} = $$props;
		let selectedFiles = /* @__PURE__ */ new Set();
		let showTagModal = false;
		let taggingFile = null;
		function formatMimeType(mime) {
			if (!mime) return 'Unknown';
			const parts = mime.split('/');
			return parts[1] ? parts[1].toUpperCase() : parts[0].toUpperCase();
		}
		function getFileIcon(file) {
			const fileName = file.filename || '';
			const fileExt = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
			switch (true) {
				case file.type === 'image':
					return 'fa-solid:image';
				case file.type === 'video':
					return 'fa-solid:video';
				case file.type === 'audio':
					return 'fa-solid:play-circle';
				case fileExt === '.pdf':
					return 'vscode-icons:file-type-pdf2';
				case fileExt === '.doc' || fileExt === '.docx' || fileExt === '.docm':
					return 'vscode-icons:file-type-word';
				case fileExt === '.ppt' || fileExt === '.pptx':
					return 'vscode-icons:file-type-powerpoint';
				case fileExt === '.xls' || fileExt === '.xlsx':
					return 'vscode-icons:file-type-excel';
				case fileExt === '.txt':
					return 'fa-solid:file-lines';
				case fileExt === '.zip' || fileExt === '.rar':
					return 'fa-solid:file-zipper';
				default:
					return 'vscode-icons:file';
			}
		}
		function getThumbnails(file) {
			return 'thumbnails' in file ? file.thumbnails || {} : {};
		}
		function getThumbnail(file, size) {
			const thumbnails = getThumbnails(file);
			const sizeMap = { tiny: 'thumbnail', small: 'sm', medium: 'md', large: 'lg' };
			const key = sizeMap[size] || size;
			return thumbnails ? thumbnails[key] : void 0;
		}
		function getImageUrl(file, size) {
			const thumbnail = getThumbnail(file, size);
			return thumbnail?.url || file.url;
		}
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			$$renderer3.push(`<div class="flex flex-wrap items-center gap-4 overflow-auto">`);
			if (filteredFiles.length === 0) {
				$$renderer3.push('<!--[-->');
				$$renderer3.push(
					`<div class="mx-auto text-center text-tertiary-500 dark:text-primary-500"><iconify-icon icon="bi:exclamation-circle-fill" height="44" class="mb-2"></iconify-icon> <p class="text-lg">No media found</p></div>`
				);
			} else {
				$$renderer3.push('<!--[!-->');
				$$renderer3.push(
					`<div class="mb-4 flex w-full items-center justify-between gap-2 rounded border border-surface-400 bg-surface-100 p-2 dark:bg-surface-700"><div class="flex items-center gap-2"><button class="preset-outline-surface-500 btn-sm" aria-label="Toggle selection mode"><iconify-icon${attr('icon', 'mdi:checkbox-multiple-marked')} width="20"></iconify-icon> ${escape_html('Select')}</button> `
				);
				{
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--></div> `);
				if (selectedFiles.size > 0) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="flex items-center gap-2"><span class="text-sm">${escape_html(selectedFiles.size)} selected</span> <button class="preset-filled-error-500 btn-sm"><iconify-icon icon="mdi:delete" width="20"></iconify-icon> Delete Selected</button></div>`
					);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--></div> <!--[-->`);
				const each_array = ensure_array_like(filteredFiles);
				for (let index2 = 0, $$length = each_array.length; index2 < $$length; index2++) {
					let file = each_array[index2];
					const fileId = file._id?.toString() || file.filename;
					const isSelected = selectedFiles.has(fileId);
					$$renderer3.push(
						`<div role="button" tabindex="0"${attr_class(`card relative border border-surface-300 dark:border-surface-500 ${stringify(isSelected ? 'ring-2 ring-primary-500' : '')}`, 'svelte-1gtiqps')}>`
					);
					{
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--> <header class="m-2 flex w-auto items-center justify-between">`);
					Tooltip($$renderer3, {
						positioning: { placement: 'right' },
						children: ($$renderer4) => {
							$$renderer4.push(`<!---->`);
							Tooltip.Trigger($$renderer4, {
								children: ($$renderer5) => {
									$$renderer5.push(
										`<button aria-label="File Info" class="btn-icon" title="File Info"><iconify-icon icon="raphael:info" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon></button>`
									);
								},
								$$slots: { default: true }
							});
							$$renderer4.push(`<!----> `);
							Portal($$renderer4, {
								children: ($$renderer5) => {
									$$renderer5.push(`<!---->`);
									Tooltip.Positioner($$renderer5, {
										children: ($$renderer6) => {
											$$renderer6.push(`<!---->`);
											Tooltip.Content($$renderer6, {
												class: 'rounded-container-token z-50 border border-surface-500 bg-surface-50 p-2 shadow-xl dark:bg-surface-900',
												children: ($$renderer7) => {
													$$renderer7.push(
														`<table class="table-auto text-xs"><thead class="text-tertiary-500"><tr class="divide-x divide-surface-400 border-b-2 border-surface-400 text-center"><th class="px-2 text-left">Format</th><th class="px-2">Pixel</th><th class="px-2">Size</th></tr></thead><tbody>`
													);
													if ('width' in file && file.width && 'height' in file && file.height) {
														$$renderer7.push('<!--[-->');
														$$renderer7.push(
															`<tr><td class="px-2 font-semibold">Original:</td><td class="px-2">${escape_html(file.width)}x${escape_html(file.height)}</td><td class="px-2">${escape_html(formatBytes(file.size))}</td></tr>`
														);
													} else {
														$$renderer7.push('<!--[!-->');
													}
													$$renderer7.push(`<!--]--><!--[-->`);
													const each_array_1 = ensure_array_like(Object.keys(getThumbnails(file)));
													for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
														let size = each_array_1[$$index];
														const thumbnail = getThumbnail(file, size);
														if (thumbnail) {
															$$renderer7.push('<!--[-->');
															$$renderer7.push(
																`<tr${attr_class(`divide-x divide-surface-400 border-b border-surface-400 last:border-b-0 ${stringify(size === gridSize ? 'bg-primary-50 dark:bg-primary-900/20' : '')}`)}><td class="px-2 font-bold text-tertiary-500">${escape_html(size)} `
															);
															if (size === gridSize) {
																$$renderer7.push('<!--[-->');
																$$renderer7.push(`<span class="ml-1 text-[10px] text-primary-500">(active)</span>`);
															} else {
																$$renderer7.push('<!--[!-->');
															}
															$$renderer7.push(`<!--]--></td><td class="px-2 text-right">`);
															if (thumbnail.width && thumbnail.height) {
																$$renderer7.push('<!--[-->');
																$$renderer7.push(`${escape_html(thumbnail.width)}x${escape_html(thumbnail.height)}`);
															} else {
																$$renderer7.push('<!--[!-->');
																$$renderer7.push(`N/A`);
															}
															$$renderer7.push(`<!--]--></td><td class="px-2 text-right">`);
															if (thumbnail.size) {
																$$renderer7.push('<!--[-->');
																$$renderer7.push(`${escape_html(formatBytes(thumbnail.size))}`);
															} else {
																$$renderer7.push('<!--[!-->');
																if (size === 'original' && file.size) {
																	$$renderer7.push('<!--[-->');
																	$$renderer7.push(`${escape_html(formatBytes(file.size))}`);
																} else {
																	$$renderer7.push('<!--[!-->');
																	$$renderer7.push(`N/A`);
																}
																$$renderer7.push(`<!--]-->`);
															}
															$$renderer7.push(`<!--]--></td></tr>`);
														} else {
															$$renderer7.push('<!--[!-->');
														}
														$$renderer7.push(`<!--]-->`);
													}
													$$renderer7.push(`<!--]--></tbody></table> <!---->`);
													Tooltip.Arrow($$renderer7, { class: 'fill-surface-50 dark:fill-surface-900' });
													$$renderer7.push(`<!---->`);
												},
												$$slots: { default: true }
											});
											$$renderer6.push(`<!---->`);
										},
										$$slots: { default: true }
									});
									$$renderer5.push(`<!---->`);
								},
								$$slots: { default: true }
							});
							$$renderer4.push(`<!---->`);
						},
						$$slots: { default: true }
					});
					$$renderer3.push(`<!----> <div class="flex items-center gap-1">`);
					if (file.type === 'image') {
						$$renderer3.push('<!--[-->');
						Tooltip($$renderer3, {
							positioning: { placement: 'top' },
							children: ($$renderer4) => {
								$$renderer4.push(`<!---->`);
								Tooltip.Trigger($$renderer4, {
									children: ($$renderer5) => {
										$$renderer5.push(`<button aria-label="Toggle Tags" class="btn-icon">`);
										if (file.metadata?.aiTags?.length || file.metadata?.tags?.length) {
											$$renderer5.push('<!--[-->');
											$$renderer5.push(`<iconify-icon icon="mdi:tag-multiple" width="22" class="text-primary-500"></iconify-icon>`);
										} else {
											$$renderer5.push('<!--[!-->');
											$$renderer5.push(`<iconify-icon icon="mdi:tag-outline" width="22" class="text-surface-500"></iconify-icon>`);
										}
										$$renderer5.push(`<!--]--></button>`);
									},
									$$slots: { default: true }
								});
								$$renderer4.push(`<!----> `);
								Portal($$renderer4, {
									children: ($$renderer5) => {
										$$renderer5.push(`<!---->`);
										Tooltip.Positioner($$renderer5, {
											children: ($$renderer6) => {
												$$renderer6.push(`<!---->`);
												Tooltip.Content($$renderer6, {
													class: 'rounded bg-surface-900 px-2 py-1 text-xs text-white shadow-xl dark:bg-surface-100 dark:text-black',
													children: ($$renderer7) => {
														$$renderer7.push(`<!---->View/Edit Tags <!---->`);
														Tooltip.Arrow($$renderer7, { class: 'fill-surface-900 dark:fill-surface-100' });
														$$renderer7.push(`<!---->`);
													},
													$$slots: { default: true }
												});
												$$renderer6.push(`<!---->`);
											},
											$$slots: { default: true }
										});
										$$renderer5.push(`<!---->`);
									},
									$$slots: { default: true }
								});
								$$renderer4.push(`<!---->`);
							},
							$$slots: { default: true }
						});
						$$renderer3.push(`<!----> `);
						Tooltip($$renderer3, {
							positioning: { placement: 'top' },
							children: ($$renderer4) => {
								$$renderer4.push(`<!---->`);
								Tooltip.Trigger($$renderer4, {
									children: ($$renderer5) => {
										$$renderer5.push(
											`<button aria-label="Edit" class="btn-icon"><iconify-icon icon="mdi:pen" width="24" class="text-primary-500"></iconify-icon></button>`
										);
									},
									$$slots: { default: true }
								});
								$$renderer4.push(`<!----> `);
								Portal($$renderer4, {
									children: ($$renderer5) => {
										$$renderer5.push(`<!---->`);
										Tooltip.Positioner($$renderer5, {
											children: ($$renderer6) => {
												$$renderer6.push(`<!---->`);
												Tooltip.Content($$renderer6, {
													class: 'rounded bg-surface-900 px-2 py-1 text-xs text-white shadow-xl dark:bg-surface-100 dark:text-black',
													children: ($$renderer7) => {
														$$renderer7.push(`<!---->Edit Image <!---->`);
														Tooltip.Arrow($$renderer7, { class: 'fill-surface-900 dark:fill-surface-100' });
														$$renderer7.push(`<!---->`);
													},
													$$slots: { default: true }
												});
												$$renderer6.push(`<!---->`);
											},
											$$slots: { default: true }
										});
										$$renderer5.push(`<!---->`);
									},
									$$slots: { default: true }
								});
								$$renderer4.push(`<!---->`);
							},
							$$slots: { default: true }
						});
						$$renderer3.push(`<!---->`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--> `);
					Tooltip($$renderer3, {
						positioning: { placement: 'top' },
						children: ($$renderer4) => {
							$$renderer4.push(`<!---->`);
							Tooltip.Trigger($$renderer4, {
								children: ($$renderer5) => {
									$$renderer5.push(
										`<button aria-label="Delete" class="btn-icon"><iconify-icon icon="icomoon-free:bin" width="24" class="text-error-500"></iconify-icon></button>`
									);
								},
								$$slots: { default: true }
							});
							$$renderer4.push(`<!----> `);
							Portal($$renderer4, {
								children: ($$renderer5) => {
									$$renderer5.push(`<!---->`);
									Tooltip.Positioner($$renderer5, {
										children: ($$renderer6) => {
											$$renderer6.push(`<!---->`);
											Tooltip.Content($$renderer6, {
												class: 'rounded bg-surface-900 px-2 py-1 text-xs text-white shadow-xl dark:bg-surface-100 dark:text-black',
												children: ($$renderer7) => {
													$$renderer7.push(`<!---->Delete Image <!---->`);
													Tooltip.Arrow($$renderer7, { class: 'fill-surface-900 dark:fill-surface-100' });
													$$renderer7.push(`<!---->`);
												},
												$$slots: { default: true }
											});
											$$renderer6.push(`<!---->`);
										},
										$$slots: { default: true }
									});
									$$renderer5.push(`<!---->`);
								},
								$$slots: { default: true }
							});
							$$renderer4.push(`<!---->`);
						},
						$$slots: { default: true }
					});
					$$renderer3.push(`<!----></div></header> <section class="flex items-center justify-center p-2">`);
					if (file?.filename && file?.path && file?.hash) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<img${attr('src', getImageUrl(file, gridSize) ?? '/static/Default_User.svg')}${attr('alt', `Thumbnail for ${file.filename}`)}${attr_class(
								`rounded object-cover ${gridSize === 'tiny' ? 'h-16 w-16' : gridSize === 'small' ? 'h-24 w-24' : gridSize === 'medium' ? 'h-48 w-48' : 'h-80 w-80'}`,
								'svelte-1gtiqps'
							)} loading="lazy" decoding="async" onerror="this.__e=event"/>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
						$$renderer3.push(
							`<div class="flex h-full w-full items-center justify-center bg-surface-200 dark:bg-surface-700" aria-label="Missing thumbnail" role="img"><iconify-icon icon="bi:exclamation-triangle-fill" height="24" class="text-warning-500" aria-hidden="true"></iconify-icon></div>`
						);
					}
					$$renderer3.push(
						`<!--]--></section> <div class="label overflow-hidden text-ellipsis whitespace-nowrap p-1 text-center font-bold text-xs"${attr('title', file.filename)}>${escape_html(file.filename)}</div> <footer class="flex flex-col gap-2 p-1"><div class="flex grow items-center justify-between p-1 text-white"><div class="bg-tertiary-500 dark:bg-primary-500/50 badge flex items-center gap-1 overflow-hidden"${attr('title', file.type)}><iconify-icon${attr('icon', getFileIcon(file))} width="12" height="12"></iconify-icon> <span class="truncate text-[10px] uppercase">${escape_html(formatMimeType(file.mimeType))}</span></div> <p class="bg-tertiary-500 dark:bg-primary-500/50 badge flex shrink-0 items-center gap-1 text-[10px]"><span>${escape_html((file.size / 1024).toFixed(2))}</span> KB</p></div></footer></div>`
					);
				}
				$$renderer3.push(`<!--]-->`);
			}
			$$renderer3.push(`<!--]--></div> `);
			TagEditorModal($$renderer3, {
				onUpdate: onUpdateImage,
				get show() {
					return showTagModal;
				},
				set show($$value) {
					showTagModal = $$value;
					$$settled = false;
				},
				get file() {
					return taggingFile;
				},
				set file($$value) {
					taggingFile = $$value;
					$$settled = false;
				}
			});
			$$renderer3.push(`<!---->`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer2.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer2.subsume($$inner_renderer);
		bind_props($$props, { filteredFiles });
	});
}
function MediaTable($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let {
			filteredFiles = [],
			tableSize = 'medium',
			ondeleteImage = () => {},
			onSelectionChange = () => {},
			onUpdateImage = () => {},
			onEditImage = () => {},
			onDeleteFiles = () => {}
		} = $$props;
		let globalSearchValue = '';
		let filterShow = false;
		let columnShow = false;
		let density = 'normal';
		const selectedFiles = /* @__PURE__ */ new Set();
		let showTagModal = false;
		let taggingFile = null;
		function handleSelection(file, checked) {
			if (checked) {
				selectedFiles.add(file.filename);
			} else {
				selectedFiles.delete(file.filename);
			}
			onSelectionChange(filteredFiles.filter((f) => selectedFiles.has(f.filename)));
		}
		let currentPage = 1;
		let rowsPerPage = 10;
		const pagesCount = Math.ceil(filteredFiles.length / rowsPerPage);
		const paginatedFiles = filteredFiles.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
		function getThumbnails(file) {
			return 'thumbnails' in file ? file.thumbnails || {} : {};
		}
		function getThumbnail(file, size) {
			const thumbnails = getThumbnails(file);
			const sizeMap = {
				tiny: 'thumbnail',
				// or 'xs'
				small: 'sm',
				medium: 'md',
				large: 'lg'
			};
			const key = sizeMap[size] || size;
			return thumbnails ? thumbnails[key] : void 0;
		}
		function getImageUrl(file, size) {
			const thumbnail = getThumbnail(file, size);
			return thumbnail?.url || file.url;
		}
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			$$renderer3.push(`<div class="block w-full overflow-hidden">`);
			if (filteredFiles.length === 0) {
				$$renderer3.push('<!--[-->');
				$$renderer3.push(
					`<div class="mx-auto text-center text-tertiary-500 dark:text-primary-500"><iconify-icon icon="bi:exclamation-circle-fill" height="44" class="mb-2"></iconify-icon> <p class="text-lg">No media found</p></div>`
				);
			} else {
				$$renderer3.push('<!--[!-->');
				$$renderer3.push(
					`<div class="mb-4 flex items-center justify-between"><div class="flex items-center gap-2"><h2 class="text-lg font-bold">Media Files</h2> `
				);
				if (selectedFiles.size > 0) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<button class="variant-filled-error btn btn-sm ml-4"><iconify-icon icon="mdi:trash-can-outline"></iconify-icon> <span>Delete (${escape_html(selectedFiles.size)})</span></button>`
					);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--></div> <div class="flex items-center gap-2">`);
				TableFilter($$renderer3, {
					get globalSearchValue() {
						return globalSearchValue;
					},
					set globalSearchValue($$value) {
						globalSearchValue = $$value;
						$$settled = false;
					},
					get filterShow() {
						return filterShow;
					},
					set filterShow($$value) {
						filterShow = $$value;
						$$settled = false;
					},
					get columnShow() {
						return columnShow;
					},
					set columnShow($$value) {
						columnShow = $$value;
						$$settled = false;
					},
					get density() {
						return density;
					},
					set density($$value) {
						density = $$value;
						$$settled = false;
					}
				});
				$$renderer3.push(
					`<!----></div></div> <div class="table-container max-h-[calc(100vh-120px)] overflow-auto"><table class="table table-interactive table-hover"><thead class="bg-surface-100-800-token sticky top-0 text-tertiary-500 dark:text-primary-500"><tr class="divide-x divide-surface-400 border-b border-black dark:border-white text-tertiary-500 dark:text-primary-500"><th class="w-10">Select</th><th>Thumbnail</th><th>Name ${escape_html('')}</th><th>Size ${escape_html('')}</th><th>Type ${escape_html('')}</th><th>Path</th><th>Tags</th><th>Actions</th></tr></thead><tbody><!--[-->`
				);
				const each_array = ensure_array_like(paginatedFiles);
				for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
					let file = each_array[$$index];
					$$renderer3.push(`<tr class="divide-x divide-surface-400 border-b border-black dark:border-white">`);
					TableIcons($$renderer3, {
						cellClass: 'w-10 text-center',
						checked: selectedFiles.has(file.filename),
						onCheck: (checked) => handleSelection(file, checked)
					});
					$$renderer3.push(`<!----><td>`);
					if (file?.filename && file?.path && file?.hash) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<img${attr('src', getImageUrl(file, tableSize) ?? '/Default_User.svg')}${attr('alt', `Thumbnail for ${file.filename}`)}${attr_class(`object-cover ${tableSize === 'tiny' ? 'h-10 w-10' : tableSize === 'small' ? 'h-16 w-16' : tableSize === 'medium' ? 'h-24 w-24' : 'h-32 w-32'}`)} loading="lazy" decoding="async" onerror="this.__e=event"/>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
						$$renderer3.push(
							`<div class="flex h-full w-full items-center justify-center bg-surface-200 dark:bg-surface-700" aria-label="Missing thumbnail" role="img"><iconify-icon icon="bi:exclamation-triangle-fill" height="24" class="text-warning-500" aria-hidden="true"></iconify-icon></div>`
						);
					}
					$$renderer3.push(`<!--]--></td><td${attr('title', file.filename)}>${escape_html(file.filename)}</td><td>`);
					if (file.size) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`${escape_html(formatBytes(file.size))}`);
					} else {
						$$renderer3.push('<!--[!-->');
						$$renderer3.push(`Size unknown`);
					}
					$$renderer3.push(
						`<!--]--></td><td>${escape_html(file.type || 'Unknown')}</td><td>${escape_html(file.path)}</td><td><div class="flex flex-wrap gap-1">`
					);
					if ('metadata' in file && (file.metadata?.tags?.length || file.metadata?.aiTags?.length)) {
						$$renderer3.push('<!--[-->');
						const tags = file.metadata.tags || [];
						const aiTags = file.metadata.aiTags || [];
						const allTagsCount = tags.length + aiTags.length;
						if (tags.length > 0) {
							$$renderer3.push('<!--[-->');
							$$renderer3.push(`<span class="badge variant-filled-surface text-[10px]">${escape_html(tags[0])}</span>`);
						} else {
							$$renderer3.push('<!--[!-->');
							if (aiTags.length > 0) {
								$$renderer3.push('<!--[-->');
								$$renderer3.push(`<span class="badge variant-filled-secondary text-[10px]">${escape_html(aiTags[0])}</span>`);
							} else {
								$$renderer3.push('<!--[!-->');
							}
							$$renderer3.push(`<!--]-->`);
						}
						$$renderer3.push(`<!--]--> `);
						if (allTagsCount > 1) {
							$$renderer3.push('<!--[-->');
							$$renderer3.push(`<span class="badge variant-soft text-[10px]">+${escape_html(allTagsCount - 1)}</span>`);
						} else {
							$$renderer3.push('<!--[!-->');
						}
						$$renderer3.push(`<!--]-->`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--> `);
					Tooltip($$renderer3, {
						positioning: { placement: 'top' },
						children: ($$renderer4) => {
							$$renderer4.push(`<!---->`);
							Tooltip.Trigger($$renderer4, {
								children: ($$renderer5) => {
									$$renderer5.push(
										`<button class="btn-icon btn-icon-sm variant-soft-primary" aria-label="Manage Tags"><iconify-icon icon="mdi:tag-edit"></iconify-icon></button>`
									);
								},
								$$slots: { default: true }
							});
							$$renderer4.push(`<!----> `);
							Portal($$renderer4, {
								children: ($$renderer5) => {
									$$renderer5.push(`<!---->`);
									Tooltip.Positioner($$renderer5, {
										children: ($$renderer6) => {
											$$renderer6.push(`<!---->`);
											Tooltip.Content($$renderer6, {
												class: 'rounded bg-surface-900 px-2 py-1 text-xs text-white shadow-xl dark:bg-surface-100 dark:text-black',
												children: ($$renderer7) => {
													$$renderer7.push(`<!---->Manage Tags <!---->`);
													Tooltip.Arrow($$renderer7, { class: 'fill-surface-900 dark:fill-surface-100' });
													$$renderer7.push(`<!---->`);
												},
												$$slots: { default: true }
											});
											$$renderer6.push(`<!---->`);
										},
										$$slots: { default: true }
									});
									$$renderer5.push(`<!---->`);
								},
								$$slots: { default: true }
							});
							$$renderer4.push(`<!---->`);
						},
						$$slots: { default: true }
					});
					$$renderer3.push(
						`<!----></div></td><td><button class="preset-outlined-primary-500 btn-sm" aria-label="Edit">Edit</button> <button class="preset-filled-error-500 btn-sm" aria-label="Delete">Delete</button></td></tr>`
					);
				}
				$$renderer3.push(
					`<!--]--></tbody></table> <div class="bg-surface-100-800-token sticky bottom-0 left-0 right-0 mt-2 flex flex-col items-center justify-center px-2 py-2 md:flex-row md:justify-between md:p-4">`
				);
				TablePagination($$renderer3, {
					pagesCount,
					totalItems: filteredFiles.length,
					rowsPerPageOptions: [5, 10, 25, 50, 100],
					onUpdatePage: (page) => {
						currentPage = page;
					},
					onUpdateRowsPerPage: (rows) => {
						rowsPerPage = rows;
						currentPage = 1;
					},
					get currentPage() {
						return currentPage;
					},
					set currentPage($$value) {
						currentPage = $$value;
						$$settled = false;
					},
					get rowsPerPage() {
						return rowsPerPage;
					},
					set rowsPerPage($$value) {
						rowsPerPage = $$value;
						$$settled = false;
					}
				});
				$$renderer3.push(`<!----></div></div>`);
			}
			$$renderer3.push(`<!--]--> `);
			TagEditorModal($$renderer3, {
				onUpdate: onUpdateImage,
				get show() {
					return showTagModal;
				},
				set show($$value) {
					showTagModal = $$value;
					$$settled = false;
				},
				get file() {
					return taggingFile;
				},
				set file($$value) {
					taggingFile = $$value;
					$$settled = false;
				}
			});
			$$renderer3.push(`<!----></div>`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer2.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer2.subsume($$inner_renderer);
		bind_props($$props, { filteredFiles });
	});
}
function VirtualMediaGrid($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { filteredFiles = [], gridSize } = $$props;
		let containerHeight = 600;
		let scrollTop = 0;
		const itemHeight = gridSize === 'tiny' ? 120 : gridSize === 'small' ? 160 : gridSize === 'medium' ? 280 : 400;
		let itemsPerRow = 5;
		const visibleRows = Math.ceil(containerHeight / itemHeight) + 2;
		const totalRows = Math.ceil(filteredFiles.length / itemsPerRow);
		const startRow = Math.max(0, Math.floor(scrollTop / itemHeight) - 1);
		const endRow = Math.min(totalRows, startRow + visibleRows);
		const visibleItems = filteredFiles.slice(startRow * itemsPerRow, endRow * itemsPerRow);
		const paddingTop = startRow * itemHeight;
		const paddingBottom = (totalRows - endRow) * itemHeight;
		let selectedFiles = /* @__PURE__ */ new Set();
		let activePopup = null;
		$$renderer2.push(
			`<div class="flex h-full flex-col"><div class="mb-4 flex w-full flex-wrap items-center justify-between gap-2 rounded border border-surface-400 bg-surface-100 p-2 dark:bg-surface-700"><div class="flex flex-wrap items-center gap-2"><button class="preset-outline-surface-500 btn-sm" aria-label="Toggle selection mode"><iconify-icon${attr('icon', 'mdi:checkbox-multiple-marked')} width="20"></iconify-icon> ${escape_html('Select')}</button> `
		);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div> `);
		if (selectedFiles.size > 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="flex flex-wrap items-center gap-2"><span class="text-sm font-semibold">${escape_html(selectedFiles.size)} selected</span> <button class="preset-filled-primary-500 btn-sm"><iconify-icon icon="mdi:download" width="18"></iconify-icon> Download</button> <button class="preset-filled-secondary-500 btn-sm"><iconify-icon icon="mdi:tag-multiple" width="18"></iconify-icon> Tag</button> <button class="preset-filled-secondary-500 btn-sm"><iconify-icon icon="mdi:folder-move" width="18"></iconify-icon> Move</button> <button class="preset-filled-secondary-500 btn-sm"><iconify-icon icon="mdi:rename-box" width="18"></iconify-icon> Rename</button> <button class="preset-filled-error-500 btn-sm"><iconify-icon icon="mdi:delete" width="18"></iconify-icon> Delete</button></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div> <div class="flex-1 overflow-y-auto"${attr_style(`height: ${stringify(containerHeight)}px;`)}>`);
		if (filteredFiles.length === 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="flex h-full items-center justify-center text-center text-tertiary-500 dark:text-primary-500"><div><iconify-icon icon="bi:exclamation-circle-fill" height="44" class="mb-2"></iconify-icon> <p class="text-lg">No media found</p></div></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(
				`<div${attr_style(`padding-top: ${stringify(paddingTop)}px; padding-bottom: ${stringify(paddingBottom)}px;`)}><div class="grid gap-4 svelte-14lax1z"${attr_style(`grid-template-columns: repeat(${stringify(itemsPerRow)}, 1fr);`)}><!--[-->`
			);
			const each_array = ensure_array_like(visibleItems);
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let file = each_array[$$index];
				const fileId = file._id?.toString() || file.filename;
				const isSelected = selectedFiles.has(fileId);
				$$renderer2.push(
					`<div role="button" tabindex="0"${attr_class(`card relative border border-surface-300 transition-all hover:shadow-lg dark:border-surface-500 ${stringify(isSelected ? 'ring-2 ring-primary-500' : '')}`)}>`
				);
				{
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(
					`<!--]--> <header class="m-2 flex w-auto items-center justify-between relative"><button aria-label="File Info" class="btn-icon"><iconify-icon icon="raphael:info" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon></button> `
				);
				if (activePopup === fileId) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<div class="card preset-filled z-50 min-w-[250px] p-2 absolute left-8 top-0 shadow-xl" role="dialog" tabindex="-1"><table class="w-full table-auto text-xs"><tbody>`
					);
					if ('width' in file && file.width && 'height' in file && file.height) {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(`<tr><td class="font-semibold">Dimensions:</td><td>${escape_html(file.width)}x${escape_html(file.height)}</td></tr>`);
					} else {
						$$renderer2.push('<!--[!-->');
					}
					$$renderer2.push(
						`<!--]--><tr><td class="font-semibold">Size:</td><td>${escape_html(formatBytes(file.size || 0))}</td></tr><tr><td class="font-semibold">Type:</td><td>${escape_html(file.mimeType || 'N/A')}</td></tr><tr><td class="font-semibold">Hash:</td><td class="truncate"${attr('title', file.hash)}>${escape_html(file.hash?.substring(0, 8) || 'N/A')}</td></tr></tbody></table> <div class="flex justify-end mt-2"><button class="btn-icon btn-icon-sm preset-filled-surface-500" aria-label="Close"><iconify-icon icon="mdi:close" width="16"></iconify-icon></button></div></div>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--> `);
				{
					$$renderer2.push('<!--[-->');
					if (file.type === 'image') {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(
							`<button aria-label="Edit" class="btn-icon"><iconify-icon icon="mdi:pen" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon></button>`
						);
					} else {
						$$renderer2.push('<!--[!-->');
					}
					$$renderer2.push(
						`<!--]--> <button aria-label="Delete" class="btn-icon"><iconify-icon icon="mdi:delete" width="20" class="text-error-500"></iconify-icon></button>`
					);
				}
				$$renderer2.push(`<!--]--></header> <section class="flex items-center justify-center p-2">`);
				if (file?.filename && file?.url) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<img${attr('src', ('thumbnails' in file ? file.thumbnails?.sm?.url : void 0) ?? file.url ?? '/static/Default_User.svg')}${attr('alt', file.filename)}${attr_class(
							`rounded object-cover ${gridSize === 'tiny' ? 'h-16 w-16' : gridSize === 'small' ? 'h-24 w-24' : gridSize === 'medium' ? 'h-48 w-48' : 'h-80 w-80'}`,
							'svelte-14lax1z'
						)} loading="lazy" decoding="async" onerror="this.__e=event"/>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
					$$renderer2.push(
						`<div class="flex h-full w-full items-center justify-center bg-surface-200 dark:bg-surface-700"><iconify-icon icon="bi:exclamation-triangle-fill" height="24" class="text-warning-500"></iconify-icon></div>`
					);
				}
				$$renderer2.push(
					`<!--]--></section> <footer class="p-2 text-sm"><p class="truncate"${attr('title', file.filename)}>${escape_html(file.filename)}</p> <p class="text-xs text-gray-500">${escape_html(formatBytes(file.size || 0))}</p> <p class="text-xs text-gray-500">${escape_html(file.type || 'Unknown')}</p></footer></div>`
				);
			}
			$$renderer2.push(`<!--]--></div></div>`);
		}
		$$renderer2.push(
			`<!--]--></div> <div class="mt-2 flex items-center justify-between border-t border-surface-400 bg-surface-100 px-4 py-2 text-sm dark:bg-surface-700"><span>Showing ${escape_html(visibleItems.length)} of ${escape_html(filteredFiles.length)} files</span> <span>Virtual scrolling: ${escape_html(Math.round((visibleItems.length / filteredFiles.length) * 100))}% rendered</span></div></div> `
		);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function attachStyledTransformer(tr, node) {
	try {
		if (!node) {
			tr.nodes([]);
			tr.hide();
			return;
		}
		tr.nodes([node]);
		tr.show();
		tr.forceUpdate();
		tr.moveToTop();
	} catch {
		try {
			tr.nodes([]);
			tr.hide();
		} catch {}
	}
}
const attachTransformer = attachStyledTransformer;
const NS = 'annotate';
function names(event) {
	return [`${event}.${NS}`, `${event}.annotate`].join(' ');
}
function Tool$6($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let transformer = null;
		let annotations = [];
		let _toolBound = false;
		function unbindTool() {
			const { stage } = imageEditorStore.state;
			if (!stage || !_toolBound) return;
			_toolBound = false;
			stage.off(names('mousedown'));
			stage.off(names('mousemove'));
			stage.off(names('mouseup'));
			stage.off(names('click'));
			stage.off(names('dblclick'));
			if (stage.container()) stage.container().style.cursor = 'default';
			deselect();
		}
		function deselect() {
			if (!transformer) return;
			attachTransformer(transformer, null);
		}
		function cleanupAnnotations(destroy = true) {
			deselect();
			if (destroy) {
				[...annotations].forEach((a) => a.destroy());
				annotations = [];
			} else {
				annotations.forEach((a) => a.disableInteraction());
			}
			imageEditorStore.state.layer?.batchDraw();
		}
		function cleanup() {
			try {
				unbindTool();
				cleanupAnnotations(true);
				transformer?.destroy();
				transformer = null;
			} catch (e) {}
		}
		function saveState() {}
		function beforeExit() {
			cleanup();
		}
		bind_props($$props, { cleanup, saveState, beforeExit });
	});
}
const index$4 = {
	key: 'annotate',
	title: 'Annotate',
	icon: 'mdi:draw',
	tool: Tool$6
};
const __vite_glob_0_0 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: index$4
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
class BlurRegion {
	id;
	shapeNode;
	overlay;
	overlayGroup;
	transformer;
	toolbar;
	layer;
	imageNode;
	imageGroup;
	currentPattern;
	currentStrength;
	_onSelect = null;
	_onDestroy = null;
	_onClone = null;
	// cache debounce timer per-region
	_cacheTimer = null;
	constructor(opts) {
		this.id = opts.id;
		this.layer = opts.layer;
		this.imageNode = opts.imageNode;
		this.imageGroup = opts.imageGroup;
		const init = opts.init || {};
		this.currentPattern = init.pattern || 'blur';
		this.currentStrength = init.strength || 20;
		const w = init.width ?? 160;
		const h = init.height ?? 120;
		const x = init.x ?? 0;
		const y = init.y ?? 0;
		if (init.shape === 'ellipse') {
			this.shapeNode = new Konva.Ellipse({
				x,
				y,
				radiusX: w / 2,
				radiusY: h / 2,
				stroke: 'white',
				strokeWidth: 1.5,
				draggable: true,
				name: 'blurShape'
			});
		} else {
			this.shapeNode = new Konva.Rect({
				x: x - w / 2,
				y: y - h / 2,
				width: w,
				height: h,
				stroke: 'white',
				strokeWidth: 1.5,
				fill: 'rgba(59, 130, 246, 0.2)',
				// style blue selection
				draggable: true,
				name: 'blurShape'
			});
		}
		this.shapeNode.id(this.id);
		this.imageGroup.add(this.shapeNode);
		this.overlay = new Konva.Image({
			image: this.imageNode.image(),
			listening: false,
			name: 'blurOverlay',
			// Copy all visual attributes from the main image node
			x: this.imageNode.x(),
			y: this.imageNode.y(),
			width: this.imageNode.width(),
			height: this.imageNode.height(),
			scaleX: this.imageNode.scaleX(),
			scaleY: this.imageNode.scaleY(),
			rotation: this.imageNode.rotation(),
			cornerRadius: this.imageNode.cornerRadius()
		});
		this.overlayGroup = new Konva.Group({ listening: false });
		this.overlayGroup.add(this.overlay);
		this.overlay.filters([]);
		this.overlayGroup.clipFunc(this.makeClipFunc());
		this.imageGroup.add(this.overlayGroup);
		this.imageNode.zIndex(0);
		this.overlayGroup.zIndex(1);
		this.shapeNode.zIndex(2);
		this.layer.batchDraw();
		this.shapeNode.on('dragmove transform', () => {
			this.updateToolbarPosition();
			this.updateOverlayClip();
			this.layer.batchDraw();
		});
		this.setPattern(this.currentPattern);
		this.setStrength(this.currentStrength);
		this.shapeNode.on('click tap', (e) => {
			e.cancelBubble = true;
			this._onSelect?.();
		});
	}
	// Update toolbar position (local space within imageGroup)
	updateToolbarPosition() {
		if (!this.toolbar) return;
		const n = this.shapeNode;
		let localPt = { x: 0, y: 0 };
		if (n instanceof Konva.Rect) {
			localPt = { x: n.width() / 2, y: n.height() + 20 };
		} else {
			localPt = { x: 0, y: n.radiusY() + 20 };
		}
		const pos = n.getTransform().point(localPt);
		this.toolbar.position(pos);
		this.toolbar.rotation(n.rotation());
		this.layer.batchDraw();
	}
	// Update overlay clip and cache (local group logic)
	updateOverlayClip() {
		const bounds = this.shapeNode.getSelfRect();
		const padding = this.currentStrength * 2;
		const x = this.shapeNode.x() - this.overlay.x();
		const y = this.shapeNode.y() - this.overlay.y();
		const cacheRect = {
			x: x - padding,
			y: y - padding,
			width: bounds.width + padding * 2,
			height: bounds.height + padding * 2
		};
		if (this._cacheTimer) window.clearTimeout(this._cacheTimer);
		this._cacheTimer = window.setTimeout(() => {
			try {
				this.overlayGroup.clearCache();
				this.overlayGroup.cache(cacheRect);
				this.layer.batchDraw();
			} catch (e) {}
			this._cacheTimer = null;
		}, 0);
		this.layer.batchDraw();
	}
	// create a clipFunc (local sibling logic)
	makeClipFunc() {
		const shape = this.shapeNode;
		return (ctx) => {
			const tr = shape.getTransform().copy();
			const m = tr.m;
			ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
			if (shape instanceof Konva.Ellipse) {
				ctx.beginPath();
				ctx.ellipse(0, 0, shape.radiusX(), shape.radiusY(), 0, 0, Math.PI * 2);
				ctx.closePath();
			} else {
				ctx.beginPath();
				ctx.rect(0, 0, shape.width(), shape.height());
				ctx.closePath();
			}
		};
	}
	// set filter pattern and perform necessary re-cache (slow)
	setPattern(pattern) {
		this.currentPattern = pattern;
		this.overlay.filters([]);
		if (pattern === 'blur') {
			this.overlay.filters([Konva.Filters.Blur]);
		} else {
			this.overlay.filters([Konva.Filters.Pixelate]);
		}
		this.setStrength(this.currentStrength);
		this.updateOverlayClip();
	}
	// apply strength (fast)
	setStrength(strength) {
		this.currentStrength = strength;
		if (this.currentPattern === 'blur') {
			this.overlay.blurRadius(strength);
		} else {
			this.overlay.pixelSize(Math.max(1, Math.round(strength / 2)));
		}
		this.updateOverlayClip();
	}
	// fast resize during drawing (no cache)
	resizeFromStart(start, pos) {
		const width = pos.x - start.x;
		const height = pos.y - start.y;
		if (this.shapeNode instanceof Konva.Ellipse) {
			this.shapeNode.setAttrs({
				x: start.x + width / 2,
				y: start.y + height / 2,
				radiusX: Math.abs(width / 2),
				radiusY: Math.abs(height / 2)
			});
		} else {
			this.shapeNode.setAttrs({
				x: width > 0 ? start.x : pos.x,
				y: height > 0 ? start.y : pos.y,
				width: Math.abs(width),
				height: Math.abs(height)
			});
		}
	}
	// finalize region and attach a transformer (fast)
	finalize() {
		this.transformer = new Konva.Transformer({
			nodes: [this.shapeNode],
			// EXPLICIT HANDLES - Blue Circles
			anchorFill: '#3b82f6',
			anchorStroke: '#ffffff',
			anchorStrokeWidth: 2,
			anchorSize: 12,
			// Standard size
			anchorCornerRadius: 6,
			// EXPLICIT BORDER - Solid White
			borderStroke: '#ffffff',
			borderStrokeWidth: 1.5,
			borderDash: [],
			rotateEnabled: true,
			rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
			rotateAnchorOffset: 25,
			enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
			keepRatio: false,
			ignoreStroke: true,
			boundBoxFunc: (oldBox, newBox) => {
				return newBox.width < 10 || newBox.height < 10 ? oldBox : newBox;
			}
		});
		this.transformer.on('dragend transformend', () => {
			imageEditorStore.takeSnapshot();
		});
		this.imageGroup.add(this.transformer);
		this.transformer.moveToTop();
		this.shapeNode.on('dragend transformend', () => {
			imageEditorStore.takeSnapshot();
		});
		this.createToolbar();
	}
	// Create toolbar with clone/delete icons
	createToolbar() {
		if (this.toolbar) this.toolbar.destroy();
		const bounds = this.shapeNode.getClientRect();
		const toolbarY = bounds.y - 45;
		const toolbarX = bounds.x + bounds.width / 2;
		this.toolbar = new Konva.Group({
			x: toolbarX,
			y: toolbarY,
			name: 'blurToolbar'
		});
		const bg = new Konva.Rect({
			x: -45,
			y: 0,
			width: 90,
			height: 36,
			fill: '#1f2937',
			cornerRadius: 8,
			shadowColor: 'black',
			shadowBlur: 10,
			shadowOpacity: 0.4
		});
		this.toolbar.add(bg);
		const addGroup = new Konva.Group({ x: -22, y: 18, cursor: 'pointer' });
		addGroup.add(
			new Konva.Path({
				data: 'M12 4v16m8-8H4',
				stroke: 'white',
				strokeWidth: 2,
				lineCap: 'round',
				scale: { x: 0.8, y: 0.8 },
				offset: { x: 12, y: 12 }
			})
		);
		addGroup.on('click tap', (e) => {
			e.cancelBubble = true;
			this._onClone?.();
		});
		addGroup.on('mouseenter', () => {
			const stage = this.layer.getStage();
			if (stage) stage.container().style.cursor = 'pointer';
		});
		addGroup.on('mouseleave', () => {
			const stage = this.layer.getStage();
			if (stage) stage.container().style.cursor = 'crosshair';
		});
		this.toolbar.add(addGroup);
		const deleteGroup = new Konva.Group({ x: 22, y: 18, cursor: 'pointer' });
		deleteGroup.add(
			new Konva.Path({
				data: 'M3 6h18M9 6v12M15 6v12M5 6v14a2 2 0 002 2h10a2 2 0 002-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2',
				stroke: 'white',
				strokeWidth: 2,
				scale: { x: 0.7, y: 0.7 },
				offset: { x: 12, y: 12 }
			})
		);
		deleteGroup.on('click tap', (e) => {
			e.cancelBubble = true;
			this.destroy();
		});
		deleteGroup.on('mouseenter', () => {
			const stage = this.layer.getStage();
			if (stage) stage.container().style.cursor = 'pointer';
		});
		deleteGroup.on('mouseleave', () => {
			const stage = this.layer.getStage();
			if (stage) stage.container().style.cursor = 'crosshair';
		});
		this.toolbar.add(deleteGroup);
		this.imageGroup.add(this.toolbar);
		this.toolbar.zIndex(10);
		this.updateToolbarPosition();
	}
	// detect tiny regions
	isTooSmall() {
		const n = this.shapeNode;
		if (n instanceof Konva.Ellipse) return n.radiusX() < 10 || n.radiusY() < 10;
		return n.width() < 20 || n.height() < 20;
	}
	// set active UI state
	setActive(isActive) {
		if (this.transformer) this.transformer.visible(isActive);
		if (this.toolbar) this.toolbar.visible(isActive);
		if (isActive) {
			this.transformer?.moveToTop();
			this.toolbar?.moveToTop();
			this.updateToolbarPosition();
		}
		this.layer.batchDraw();
	}
	// hide UI but keep overlay for baking
	hideUI() {
		this.transformer?.visible(false);
		this.toolbar?.visible(false);
		this.shapeNode.visible(false);
	}
	// clone overlay and its clipFunc for offscreen baking
	cloneForBake() {
		try {
			const c = this.overlayGroup.clone();
			return c;
		} catch (e) {
			return null;
		}
	}
	rotate(deg) {
		this.shapeNode.rotate(deg);
		this.updateToolbarPosition();
		this.updateOverlayClip();
		this.layer.batchDraw();
	}
	flipX() {
		this.shapeNode.scaleX(this.shapeNode.scaleX() * -1);
		this.updateToolbarPosition();
		this.updateOverlayClip();
		this.layer.batchDraw();
	}
	// explicit destruction with listener removal
	destroy() {
		this.shapeNode.off('dragmove transform click tap');
		this.transformer?.destroy();
		this.toolbar?.destroy();
		this.overlayGroup.destroy();
		this.shapeNode.destroy();
		this._onDestroy?.();
	}
	// callbacks
	onSelect(cb) {
		this._onSelect = cb;
	}
	onDestroy(cb) {
		this._onDestroy = cb;
	}
	onClone(cb) {
		this._onClone = cb;
	}
}
function Tool$5($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let blurStrength = 20;
		let pattern = 'blur';
		let shape = 'rectangle';
		let regions = [];
		let activeId = null;
		let _toolBound = false;
		let { onCancel } = $$props;
		function unbindStageEvents() {
			const { stage } = imageEditorStore.state;
			if (!stage || !_toolBound) return;
			stage.off('click tap', handleStageClick);
			if (stage.container()) stage.container().style.cursor = 'default';
			_toolBound = false;
		}
		function handleStageClick(e) {
			const { stage, imageNode, imageGroup } = imageEditorStore.state;
			const t = e.target;
			if (!stage) return;
			if (t === stage || t === imageNode || t === imageGroup) {
				const pos = stage.getPointerPosition();
				if (pos) {
					createRegion({
						x: pos.x - 100,
						y: pos.y - 75,
						width: 200,
						height: 150,
						shape
					});
				}
			}
		}
		function createRegion(init) {
			const { stage, layer, imageNode, imageGroup } = imageEditorStore.state;
			if (!stage || !layer || !imageNode || !imageGroup) return;
			const newR = new BlurRegion({
				id: crypto.randomUUID(),
				layer,
				imageNode,
				imageGroup,
				init: { shape, pattern, strength: blurStrength, ...init }
			});
			regions = [...regions, newR];
			activeId = newR.id;
			newR.onSelect(() => selectRegion(newR.id));
			newR.onClone(() => {
				const bounds = newR.shapeNode.getClientRect();
				createRegion({
					x: bounds.x + 20,
					y: bounds.y + 20,
					width: bounds.width,
					height: bounds.height,
					shape: newR.shapeNode instanceof Konva.Ellipse ? 'ellipse' : 'rectangle',
					pattern,
					strength: blurStrength
				});
			});
			newR.onDestroy(() => {
				regions = regions.filter((x) => x.id !== newR.id);
				if (activeId === newR.id) activeId = null;
			});
			newR.setPattern(pattern);
			newR.setStrength(blurStrength);
			newR.finalize();
			selectRegion(newR.id);
		}
		function selectRegion(id) {
			activeId = id;
			regions.forEach((r) => r.setActive(r.id === id));
			imageEditorStore.state.layer?.batchDraw();
		}
		function cleanupBlurElements(destroyRegions = true) {
			if (destroyRegions) {
				[...regions].forEach((region) => region.destroy());
				regions = [];
			} else {
				regions.forEach((region) => region.hideUI());
			}
			activeId = null;
			imageEditorStore.state.layer?.batchDraw();
		}
		function reset() {
			cleanupBlurElements(true);
		}
		function apply() {
			cleanupBlurElements(false);
			imageEditorStore.takeSnapshot();
			imageEditorStore.setActiveState('');
		}
		function cleanup() {
			try {
				unbindStageEvents();
				cleanupBlurElements(true);
			} catch (e) {}
		}
		function saveState() {}
		function beforeExit() {
			cleanup();
		}
		bind_props($$props, { reset, apply, cleanup, saveState, beforeExit });
	});
}
const index$3 = {
	key: 'blur',
	title: 'Blur',
	icon: 'mdi:blur',
	tool: Tool$5
};
const __vite_glob_0_1 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: index$3
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
function Tool$4($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { onCancel } = $$props;
		function cleanup() {
			imageEditorStore.state.layer?.batchDraw();
		}
		function saveState() {}
		function beforeExit() {
			cleanup();
		}
		bind_props($$props, { cleanup, saveState, beforeExit });
	});
}
const index$2 = {
	key: 'crop',
	title: 'Crop',
	icon: 'mdi:crop',
	tool: Tool$4
};
const __vite_glob_0_2 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: index$2
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
function Tool$3($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { onCancel } = $$props;
		function unbindTool() {
			return;
		}
		function cleanup() {
			try {
				unbindTool();
			} catch (e) {}
		}
		function saveState() {}
		function beforeExit() {
			cleanup();
		}
		bind_props($$props, { cleanup, saveState, beforeExit });
	});
}
const index$1 = {
	key: 'finetune',
	title: 'Fine-Tune',
	icon: 'mdi:tune',
	tool: Tool$3
};
const __vite_glob_0_3 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: index$1
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
function Tool$2($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let gridLayer = null;
		let _toolBound = false;
		let { onCancel } = $$props;
		function unbindTool() {
			const { stage } = imageEditorStore.state;
			if (!stage || !_toolBound) return;
			_toolBound = false;
			stage.off('click.focalpoint tap.focalpoint');
			if (stage.container()) stage.container().style.cursor = 'default';
			gridLayer?.destroy();
			gridLayer = null;
		}
		function cleanup() {
			try {
				unbindTool();
			} catch (e) {}
		}
		function saveState() {}
		function beforeExit() {
			cleanup();
		}
		bind_props($$props, { cleanup, saveState, beforeExit });
	});
}
const editorWidget$1 = {
	key: 'focalpoint',
	title: 'Focal',
	icon: 'mdi:target',
	tool: Tool$2,
	controls: null
};
const __vite_glob_0_4 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			editorWidget: editorWidget$1
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
function Controls($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { rotationAngle, onRotateLeft, onRotateRight, onRotationChange, onFlipHorizontal, onFlipVertical, onReset, onApply } = $$props;
		const displayAngle = () => {
			let angle = rotationAngle % 360;
			if (angle > 180) angle -= 360;
			if (angle < -180) angle += 360;
			return Math.round(angle);
		};
		$$renderer2.push(
			`<div class="flex w-full items-center gap-4"><span class="text-sm font-medium">Rotate &amp; Flip Image</span> <div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div> <div class="flex items-center gap-2"><span class="text-sm">Rotate:</span> <button class="btn btn-icon btn-sm preset-outlined-surface-500" title="Rotate Left 90°"><iconify-icon icon="mdi:rotate-left"></iconify-icon></button> <button class="btn btn-icon btn-sm preset-outlined-surface-500" title="Rotate Right 90°"><iconify-icon icon="mdi:rotate-right"></iconify-icon></button></div> <div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div> <label class="flex items-center gap-2 text-sm"><span>Angle:</span> <input type="range" min="-180" max="180" step="1"${attr('value', rotationAngle)} class="range range-primary w-32"/> <span class="w-12 text-right">${escape_html(displayAngle())}°</span></label> <div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div> <div class="flex items-center gap-2"><span class="text-sm">Flip:</span> <button class="btn btn-icon btn-sm preset-outlined-surface-500" title="Flip Horizontal"><iconify-icon icon="mdi:flip-horizontal"></iconify-icon></button> <button class="btn btn-icon btn-sm preset-outlined-surface-500" title="Flip Vertical"><iconify-icon icon="mdi:flip-vertical"></iconify-icon></button></div> <div class="grow"></div> <button class="btn preset-outlined-surface-500"><iconify-icon icon="mdi:restore"></iconify-icon> <span>Reset</span></button> <button class="btn preset-filled-success-500"><iconify-icon icon="mdi:check"></iconify-icon> <span>Apply</span></button></div>`
		);
	});
}
function Tool$1($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		function cleanup() {}
		function saveState() {}
		function beforeExit() {}
		$$renderer2.push(`<!---->/** * @file shared/image-editor/src/widgets/Rotate/Tool.svelte * @component **Rotate tool for rotating and flipping images** ### Features: - Rotates
and flips images - Resets rotation and flips - Applies changes to the image */ // imageEditor/widgets/Rotate/Tool.svelte /** * @file
src/components/imageEditor/widgets/Rotate/Tool.svelte * @component * Rotate tool for rotating and flipping images */`);
		bind_props($$props, { cleanup, saveState, beforeExit });
	});
}
const widget = {
	key: 'rotate',
	title: 'Rotate',
	icon: 'mdi:rotate-right',
	tool: Tool$1,
	controls: Controls
};
const editorWidget = widget;
const __vite_glob_0_5 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: editorWidget,
			editorWidget
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
function Tool($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let watermarks = [];
		let transformer = null;
		let _toolBound = false;
		getContext('watermarkPreset');
		function unbindTool() {
			const { stage } = imageEditorStore.state;
			if (!stage || !_toolBound) return;
			_toolBound = false;
			stage.off('click.watermark tap.watermark');
			if (stage.container()) stage.container().style.cursor = 'default';
			deselect();
		}
		function deselect() {
			if (!transformer) return;
			attachStyledTransformer(transformer, null);
		}
		function cleanupWatermarks(destroy = true) {
			deselect();
			if (destroy) {
				[...watermarks].forEach((w) => w.destroy());
				watermarks = [];
			} else {
				watermarks.forEach((w) => w.disableInteraction());
			}
			imageEditorStore.state.layer?.batchDraw();
		}
		function cleanup() {
			try {
				unbindTool();
				cleanupWatermarks(true);
				transformer?.destroy();
				transformer = null;
			} catch (e) {}
		}
		function saveState() {}
		function beforeExit() {
			cleanup();
		}
		$$renderer2.push(`<input type="file" accept="image/png, image/svg+xml" class="hidden"/>`);
		bind_props($$props, { cleanup, saveState, beforeExit });
	});
}
const index = {
	key: 'watermark',
	title: 'Watermark',
	icon: 'mdi:copyright',
	tool: Tool
};
const __vite_glob_0_6 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: index
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
const modules = /* @__PURE__ */ Object.assign({
	'./Annotate/index.ts': __vite_glob_0_0,
	'./Blur/index.ts': __vite_glob_0_1,
	'./Crop/index.ts': __vite_glob_0_2,
	'./FineTune/index.ts': __vite_glob_0_3,
	'./FocalPoint/index.ts': __vite_glob_0_4,
	'./Rotate/index.ts': __vite_glob_0_5,
	'./Watermark/index.ts': __vite_glob_0_6
});
const editorWidgets = Object.values(modules)
	.map((m) => {
		const mod = m;
		return mod.default ?? mod.editorWidget;
	})
	.filter((w) => !!w);
function EditorSidebar($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { activeState, hasImage = false } = $$props;
		const tools = [
			...editorWidgets.map((w) => ({
				id: w.key,
				name: w.title,
				icon: w.icon ?? 'mdi:cog',
				description: ''
			}))
		];
		function isToolActive(tool) {
			return activeState === tool.id;
		}
		$$renderer2.push(
			`<div class="editor-sidebar flex w-20 flex-col border-r lg:w-24 svelte-tmcsbf"><div class="sidebar-tools flex flex-1 flex-col gap-1 p-1.5 lg:p-2 max-lg:gap-0.5 max-lg:p-1"><!--[-->`
		);
		const each_array = ensure_array_like(tools);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let tool = each_array[$$index];
			$$renderer2.push(
				`<button${attr_class('btn preset-filled-primary-500 group relative flex flex-col items-center justify-center gap-1 py-2', void 0, {
					active: isToolActive(tool),
					disabled: !hasImage,
					'bg-primary-500': isToolActive(tool),
					'text-white': isToolActive(tool),
					'shadow-md': isToolActive(tool),
					'hover:bg-primary-600': isToolActive(tool),
					'cursor-not-allowed': !hasImage,
					'opacity-50': !hasImage,
					'bg-transparent': !hasImage
				})}${attr('aria-label', tool.name)}${attr('disabled', !hasImage, true)}><div class="tool-icon flex items-center justify-center"><iconify-icon${attr('icon', tool.icon)} width="24"></iconify-icon></div> <span class="tool-label text-[10px] font-medium leading-none lg:text-xs">${escape_html(tool.name)}</span> <div class="tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded bg-surface-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:bg-surface-700 shadow-lg"><div class="font-medium">${escape_html(tool.name)}</div> `
			);
			if (tool.description) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<div class="text-[10px] text-surface-300">${escape_html(tool.description)}</div>`);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(
				`<!--]--> <div class="absolute -left-1 top-1/2 -mt-1 h-2 w-2 -rotate-45 bg-surface-900 dark:bg-surface-700"></div></div></button>`
			);
		}
		$$renderer2.push(`<!--]--></div> <div class="sidebar-footer border-t p-2 svelte-tmcsbf">`);
		if (!hasImage) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="no-image-hint flex flex-col items-center gap-1 p-2 text-center"><iconify-icon icon="mdi:information-outline" width="16" class="text-surface-400"></iconify-icon> <span class="text-xs text-surface-500 dark:text-surface-50">Upload an image to enable tools</span></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div></div>`);
	});
}
function EditorCanvas($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { hasImage = false, isLoading = false, loadingMessage = 'Loading...', containerRef = void 0, children } = $$props;
		$$renderer2.push(
			`<div class="editor-canvas-wrapper relative flex-1 overflow-hidden rounded-lg border border-surface-200 transition-all duration-300 ease-in-out focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2 focus-within:ring-offset-surface-50 dark:focus-within:ring-offset-surface-900 md:rounded-lg md:border md:border-surface-200 max-md:rounded-none max-md:border-0 max-md:border-b max-md:border-t svelte-1mk2cuv"><div class="canvas-container h-full w-full transition-all duration-300 ease-in-out svelte-1mk2cuv"></div> `
		);
		if (!hasImage) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="empty-state pointer-events-none absolute inset-0 z-10 flex items-center justify-center svelte-1mk2cuv"><div class="empty-state-content flex max-w-md flex-col items-center gap-6 p-8 text-center max-md:p-6"><div class="empty-icon flex h-20 w-20 items-center justify-center rounded-full bg-surface-200 ring-4 ring-surface-300 dark:bg-surface-700 dark:ring-surface-600 max-md:h-16 max-md:w-16"><iconify-icon icon="mdi:image-plus" width="48" class="text-surface-400 dark:text-surface-500"></iconify-icon></div> <div class="empty-text"><h3 class="mb-2 text-lg font-medium text-surface-700 dark:text-surface-300 max-md:text-base">No Image Selected</h3> <p class="text-sm text-surface-500 dark:text-surface-50 max-md:text-xs">Upload an image to start editing</p></div> <div class="empty-hints flex flex-col gap-2"><div class="hint-item flex items-center justify-center gap-2"><iconify-icon icon="mdi:gesture-tap" width="16" class="text-surface-400"></iconify-icon> <span class="text-xs text-surface-500 dark:text-surface-50 max-md:text-[10px]">Drag &amp; drop supported</span></div> <div class="hint-item flex items-center justify-center gap-2"><iconify-icon icon="mdi:file-image" width="16" class="text-surface-400"></iconify-icon> <span class="text-xs text-surface-500 dark:text-surface-50 max-md:text-[10px]">PNG, JPG, WebP, GIF</span></div></div></div></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		children?.($$renderer2);
		$$renderer2.push(`<!----> `);
		if ((hasImage && true) || isLoading) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="loading-overlay absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-50/80 backdrop-blur-sm dark:bg-surface-900/80 z-20"><div class="loading-spinner flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg dark:bg-surface-800"><iconify-icon icon="mdi:loading" width="32" class="animate-spin text-primary-500"></iconify-icon></div> <span class="text-sm text-surface-600 dark:text-surface-300">${escape_html(loadingMessage)}</span></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div>`);
		bind_props($$props, { containerRef });
	});
}
function Editor($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { imageFile = null, initialImageSrc = '', onsave = () => {}, oncancel = () => {} } = $$props;
		let containerRef = void 0;
		let isProcessing = false;
		let error = null;
		let preToolSnapshot = null;
		const storeState = imageEditorStore.state;
		const activeState = imageEditorStore.state.activeState;
		const hasImage = !!storeState.imageNode;
		const activeToolComponent = (() => {
			if (!activeState) return null;
			const widget2 = editorWidgets.find((w) => w.key === activeState);
			if (widget2?.tool) return widget2.tool;
			if (activeState === 'focalpoint') return null;
			logger.warn(`Tool not found for state: ${activeState}`);
			return null;
		})();
		function handleUndo() {
			if (!imageEditorStore.canUndoState) return;
			const currentState = imageEditorStore.state.activeState;
			if (currentState) {
				imageEditorStore.cleanupToolSpecific(currentState);
				imageEditorStore.setActiveState('');
			}
			const stateData = imageEditorStore.undoState();
			if (stateData) {
				restoreFromStateData(stateData);
			}
		}
		function handleRedo() {
			if (!imageEditorStore.canRedoState) return;
			const currentState = imageEditorStore.state.activeState;
			if (currentState) {
				imageEditorStore.cleanupToolSpecific(currentState);
				imageEditorStore.setActiveState('');
			}
			const stateData = imageEditorStore.redoState();
			if (stateData) {
				restoreFromStateData(stateData);
			}
		}
		function restoreFromStateData(stateData) {
			const { stage, layer, imageNode, imageGroup } = imageEditorStore.state;
			if (!stage || !layer || !imageNode || !imageGroup) return;
			try {
				imageEditorStore.cleanupTempNodes();
				const rawData = JSON.parse(stateData);
				const isNewFormat = rawData.stage && rawData.activeState !== void 0;
				const stateJSON = isNewFormat ? JSON.parse(rawData.stage) : rawData;
				if (isNewFormat) {
					imageEditorStore.setActiveState(rawData.activeState);
				}
				imageNode.filters([]);
				imageNode.clearCache();
				const findImageGroupState = (nodes) => {
					for (const node of nodes) {
						if (node.className === 'Group' && node.children?.some((c) => c.className === 'Image')) {
							return node;
						}
						if (node.children) {
							const found = findImageGroupState(node.children);
							if (found) return found;
						}
					}
					return null;
				};
				const imageGroupState = findImageGroupState(stateJSON.children || []);
				if (imageGroupState && imageGroupState.attrs) {
					imageGroup.setAttrs({
						x: imageGroupState.attrs.x ?? stage.width() / 2,
						y: imageGroupState.attrs.y ?? stage.height() / 2,
						scaleX: imageGroupState.attrs.scaleX ?? 1,
						scaleY: imageGroupState.attrs.scaleY ?? 1,
						rotation: imageGroupState.attrs.rotation ?? 0
					});
					const imageNodeState = imageGroupState.children.find((c) => c.className === 'Image');
					if (imageNodeState && imageNodeState.attrs) {
						imageNode.setAttrs({
							cropX: imageNodeState.attrs.cropX,
							cropY: imageNodeState.attrs.cropY,
							cropWidth: imageNodeState.attrs.cropWidth,
							cropHeight: imageNodeState.attrs.cropHeight,
							width: imageNodeState.attrs.width,
							height: imageNodeState.attrs.height,
							x: imageNodeState.attrs.x,
							y: imageNodeState.attrs.y,
							cornerRadius: imageNodeState.attrs.cornerRadius ?? 0
						});
						if (imageNodeState.attrs.filters?.length > 0) {
							const activeFilters = [];
							if (imageNodeState.attrs.brightness !== void 0) activeFilters.push(Konva.Filters.Brighten);
							if (imageNodeState.attrs.contrast !== void 0) activeFilters.push(Konva.Filters.Contrast);
							if (imageNodeState.attrs.saturation !== void 0 || imageNodeState.attrs.luminance !== void 0) activeFilters.push(Konva.Filters.HSL);
							imageNode.filters(activeFilters);
							imageNode.setAttrs(imageNodeState.attrs);
							imageNode.cache();
						}
					}
				}
				layer.batchDraw();
				stage.batchDraw();
			} catch (err) {
				logger.error('Failed to restore state:', err);
				error = 'Failed to restore state';
			}
		}
		async function handleSave() {
			const { stage, file } = imageEditorStore.state;
			if (!stage || !file) {
				error = 'Nothing to save';
				return;
			}
			isProcessing = true;
			error = null;
			try {
				imageEditorStore.hideAllUI();
				let dataURL;
				let mimeType;
				let fileExtension;
				try {
					dataURL = stage.toDataURL({ mimeType: 'image/avif', quality: 0.85, pixelRatio: 1 });
					if (dataURL.startsWith('data:image/avif')) {
						mimeType = 'image/avif';
						fileExtension = 'avif';
						logger.debug('Using AVIF format');
					} else {
						throw new Error('AVIF not supported');
					}
				} catch {
					logger.warn('AVIF not supported, using WebP');
					dataURL = stage.toDataURL({ mimeType: 'image/webp', quality: 0.95, pixelRatio: 1 });
					mimeType = 'image/webp';
					fileExtension = 'webp';
				}
				const response = await fetch(dataURL);
				const blob = await response.blob();
				const timestamp = /* @__PURE__ */ new Date().toISOString().replace(/[:.]/g, '-');
				const newFileName = `edited-${timestamp}.${fileExtension}`;
				const editedFile = new File([blob], newFileName, { type: mimeType });
				onsave({ dataURL, file: editedFile });
			} catch (err) {
				logger.error('Save error:', err);
				error = 'Failed to save image';
			} finally {
				isProcessing = false;
			}
		}
		function handleCancel() {
			oncancel();
		}
		function handleCancelTool() {
			const currentState = imageEditorStore.state.activeState;
			if (!currentState) return;
			if (preToolSnapshot) {
				restoreFromStateData(preToolSnapshot);
			}
			imageEditorStore.cleanupToolSpecific(currentState);
			imageEditorStore.setActiveState('');
			imageEditorStore.setToolbarControls(null);
			preToolSnapshot = null;
		}
		onDestroy(() => {});
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			$$renderer3.push(
				`<div class="image-editor flex h-full w-full flex-col overflow-hidden" role="application" aria-label="Image editor"${attr('aria-busy', isProcessing)}>`
			);
			if (error) {
				$$renderer3.push('<!--[-->');
				$$renderer3.push(
					`<div class="error-banner bg-error-50 border-l-4 border-error-500 p-4 text-error-700 dark:bg-error-900/20 dark:text-error-300" role="alert"><div class="flex items-center gap-2"><iconify-icon icon="mdi:alert-circle" width="20"></iconify-icon> <span>${escape_html(error)}</span> <button class="ml-auto text-error-600 hover:text-error-800" aria-label="Dismiss error"><iconify-icon icon="mdi:close" width="18"></iconify-icon></button></div></div>`
				);
			} else {
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]--> <div class="editor-layout flex h-full overflow-hidden">`);
			EditorSidebar($$renderer3, {
				activeState: activeState ?? '',
				hasImage
			});
			$$renderer3.push(`<!----> <div class="editor-main flex min-w-0 flex-1 flex-col"><div class="canvas-wrapper relative flex flex-1 flex-col">`);
			EditorCanvas($$renderer3, {
				hasImage,
				get containerRef() {
					return containerRef;
				},
				set containerRef($$value) {
					containerRef = $$value;
					$$settled = false;
				},
				children: ($$renderer4) => {
					if (storeState.stage && storeState.layer && storeState.imageNode && storeState.imageGroup) {
						$$renderer4.push('<!--[-->');
						if (activeToolComponent) {
							$$renderer4.push('<!--[-->');
							const Component = activeToolComponent;
							$$renderer4.push(`<!---->`);
							Component($$renderer4, { onCancel: handleCancelTool });
							$$renderer4.push(`<!---->`);
						} else {
							$$renderer4.push('<!--[!-->');
						}
						$$renderer4.push(`<!--]-->`);
					} else {
						$$renderer4.push('<!--[!-->');
					}
					$$renderer4.push(`<!--]-->`);
				},
				$$slots: { default: true }
			});
			$$renderer3.push(`<!----></div></div></div></div>`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer2.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer2.subsume($$inner_renderer);
		bind_props($$props, {
			handleUndo,
			handleRedo,
			handleSave,
			handleCancel,
			handleCancelTool
		});
	});
}
function EditorToolbar($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const toolbarControls = imageEditorStore.state.toolbarControls;
		$$renderer2.push(
			`<div class="border-t border-surface-300 bg-surface-100 p-2 shadow-lg dark:text-surface-50 dark:bg-surface-800 svelte-w4hoxq"><div class="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4"><div class="flex h-full flex-1 items-center gap-3">`
		);
		if (toolbarControls?.component) {
			$$renderer2.push('<!--[-->');
			const Component = toolbarControls.component;
			if (Component) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<!---->`);
				Component($$renderer2, spread_props([toolbarControls.props]));
				$$renderer2.push(`<!---->`);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]-->`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div></div> `);
		if (imageEditorStore.state.error) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="absolute bottom-full left-0 right-0 flex items-center justify-center bg-error-500 py-1 text-xs font-medium text-white"><iconify-icon icon="mdi:alert-circle" width="14" class="mr-1"></iconify-icon> ${escape_html(imageEditorStore.state.error)}</div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div>`);
	});
}
function ImageEditorModal($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let {
			image = null,
			watermarkPreset = null,
			onsave = () => {},
			close = () => {}
			/** Optional watermark preset to auto-apply when editing */
		} = $$props;
		setContext('watermarkPreset', () => watermarkPreset);
		const activeState = imageEditorStore.state.activeState;
		const activeWidget = editorWidgets.find((w) => w.key === activeState);
		const subInfo = (() => {
			if (activeState === 'finetune') {
				const props = imageEditorStore.state.toolbarControls?.props;
				if (props?.activeAdjustment) {
					const adj = props.activeAdjustment;
					return {
						label: adj.charAt(0).toUpperCase() + adj.slice(1),
						icon: props.activeIcon
					};
				}
			}
			return null;
		})();
		function handleClose() {
			if (imageEditorStore.canUndoState) {
				if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
					return;
				}
			}
			close();
		}
		if (image) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="relative flex h-full min-h-[500px] w-full flex-col overflow-hidden bg-surface-100 shadow-xl dark:bg-surface-800"><header class="flex items-center justify-between border-b border-surface-300 p-3 lg:p-4 dark:text-surface-50 bg-surface-100/80 dark:bg-surface-800/80 sticky top-0 z-10"><div class="flex items-center gap-3 overflow-hidden">`
			);
			if (activeWidget) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<div class="flex items-center gap-2 text-primary-500 shrink-0"><iconify-icon${attr('icon', activeWidget.icon)} width="24" class="max-sm:width-[20px]"></iconify-icon></div> <div class="flex flex-col min-w-0"><h2 id="image-editor-title" class="text-sm lg:text-lg font-bold truncate leading-tight flex items-center gap-1.5"><span class="max-sm:hidden">${escape_html(activeWidget.title)}</span> `
				);
				if (subInfo) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<span class="max-sm:hidden text-surface-400">:</span> <span class="flex items-center gap-1 text-primary-600 dark:text-primary-400 font-extrabold">`
					);
					if (subInfo.icon) {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(`<iconify-icon${attr('icon', subInfo.icon)} width="16" class="lg:width-[20px]"></iconify-icon>`);
					} else {
						$$renderer2.push('<!--[!-->');
					}
					$$renderer2.push(`<!--]--> <span>${escape_html(subInfo.label)}</span></span>`);
				} else {
					$$renderer2.push('<!--[!-->');
					$$renderer2.push(`<span class="sm:hidden">${escape_html(activeWidget.title)}</span>`);
				}
				$$renderer2.push(`<!--]--></h2></div>`);
			} else {
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(
					`<h2 id="image-editor-title" class="text-tertiary-500 dark:text-primary-400 text-lg font-semibold shrink-0">Image Editor</h2>`
				);
			}
			$$renderer2.push(
				`<!--]--></div> <div class="flex items-center gap-2"><button${attr('disabled', !imageEditorStore.canUndoState, true)} class="btn-icon preset-outlined-surface-500" title="Undo (Ctrl+Z)" aria-label="Undo"><iconify-icon icon="mdi:undo" width="20"></iconify-icon></button> <button${attr('disabled', !imageEditorStore.canRedoState, true)} class="btn-icon preset-outlined-surface-500" title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><iconify-icon icon="mdi:redo" width="20"></iconify-icon></button> <div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div> <button class="btn preset-outlined-surface-500">${escape_html(activeState ? 'Exit Tool' : 'Cancel')}</button> <button class="btn preset-filled-tertiary-500 dark:preset-filled-primary-500"><iconify-icon icon="mdi:content-save" width="18"></iconify-icon> <span>Save</span></button> <div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div> <button class="btn-icon preset-outlined-surface-500" aria-label="Close"><iconify-icon icon="mdi:close" width="24"></iconify-icon></button></div></header> <main class="flex-1 overflow-auto bg-surface-50/50 dark:bg-surface-900/50">`
			);
			Editor($$renderer2, {
				initialImageSrc: image.url,
				focalPoint: image?.metadata?.focalPoint,
				onsave: (detail) => onsave(detail),
				oncancel: handleClose
			});
			$$renderer2.push(`<!----></main> `);
			EditorToolbar($$renderer2);
			$$renderer2.push(`<!----></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { data } = $$props;
		let files = [];
		let breadcrumb = [];
		let globalSearchValue = '';
		let selectedMediaType = 'All';
		let view = 'grid';
		let gridSize = 'small';
		let tableSize = 'small';
		let isLoading = false;
		const USE_VIRTUAL_THRESHOLD = 100;
		const mediaTypes = [
			{ value: 'All', label: 'ALL' },
			{ value: MediaType.Image, label: 'IMAGE' },
			{ value: MediaType.Document, label: 'DOCUMENT' },
			{ value: MediaType.Audio, label: 'AUDIO' },
			{ value: MediaType.Video, label: 'VIDEO' },
			{ value: MediaType.RemoteVideo, label: 'REMOTE VIDEO' }
		];
		const filteredFiles = (() => {
			const results = files.filter((file) => {
				const matchesSearch = (file.filename || '').toLowerCase().includes(globalSearchValue.toLowerCase());
				const matchesType = selectedMediaType === 'All';
				return matchesSearch && matchesType;
			});
			return results;
		})();
		const useVirtualScrolling = filteredFiles.length > USE_VIRTUAL_THRESHOLD;
		function storeUserPreference(view2, gridSize2, tableSize2) {
			localStorage.setItem('GalleryUserPreference', `${view2}/${gridSize2}/${tableSize2}`);
		}
		const safeTableSize = tableSize;
		let lastSystemFolderId = null;
		async function fetchMediaFiles(forceRefresh = false) {
			const folderId = 'root';
			if (!forceRefresh && (isLoading || folderId === lastSystemFolderId)) return;
			isLoading = true;
			globalLoadingStore.startLoading(loadingOperations.dataFetch);
			lastSystemFolderId = folderId;
			try {
				const { data: data2 } = await axios.get(`/api/systemVirtualFolder/${folderId}`, {
					timeout: 1e4
					// 10 second timeout
				});
				if (data2.success) {
					files = Array.isArray(data2.data.contents?.files) ? data2.data.contents.files : [];
					logger.info(`Fetched ${files.length} files for folder: ${folderId}`);
				} else {
					throw new Error(data2.error || 'Unknown error');
				}
			} catch (error) {
				logger.error('Error fetching media files:', error);
				let errorMessage = 'Failed to load media';
				if (error instanceof Error) {
					if (error.message.includes('timeout')) {
						errorMessage = 'Request timed out - please try again';
					} else if (error.message.includes('network')) {
						errorMessage = 'Network error - please check your connection';
					}
				}
				toaster.error({ description: errorMessage });
				files = [];
			} finally {
				isLoading = false;
				globalLoadingStore.stopLoading(loadingOperations.dataFetch);
			}
		}
		function handleSizeChange(detail) {
			view = detail.type;
			if (detail.type === 'grid') {
				gridSize = detail.size;
			} else {
				tableSize = detail.size;
			}
			storeUserPreference(view, gridSize, tableSize);
		}
		async function handleDeleteImage(file) {
			showConfirm({
				title: 'Delete Media',
				body: `Are you sure you want to delete "${file.filename}"? This action cannot be undone.`,
				onConfirm: async () => {
					try {
						logger.info('Delete image request:', { _id: file._id, filename: file.filename });
						const formData = new FormData();
						formData.append('imageData', JSON.stringify(file));
						const response = await fetch('?/deleteMedia', { method: 'POST', body: formData });
						logger.info('Delete response status:', response.status);
						if (!response.ok) {
							const errorText = await response.text();
							logger.error('Delete failed with status:', response.status, errorText);
							throw new Error(`Server error: ${response.status} - ${errorText}`);
						}
						const result = await response.json();
						logger.debug('Delete response:', result);
						let data2 = result;
						if (result.type === 'success' && result.data) {
							data2 = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
						}
						const success = Array.isArray(data2) ? data2[0]?.success : data2?.success;
						if (success) {
							toaster.success({ description: 'Media deleted successfully.' });
							files = files.filter((f) => f._id !== file._id);
							logger.info(`Removed file ${file.filename} from UI. Remaining: ${files.length} files`);
						} else {
							throw new Error(data2?.error || 'Failed to delete media');
						}
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : String(error);
						logger.error('Error deleting media:', errorMessage);
						toaster.error({ description: `Error deleting media: ${errorMessage}` });
					}
				}
			});
		}
		async function handleBulkDelete(filesToDelete) {
			showConfirm({
				title: 'Delete Multiple Media',
				body: `Are you sure you want to delete ${filesToDelete.length} file${filesToDelete.length > 1 ? 's' : ''}? This action cannot be undone.`,
				onConfirm: async () => {
					try {
						logger.info('Bulk delete request:', { count: filesToDelete.length });
						const successfullyDeletedIds = /* @__PURE__ */ new Set();
						let successCount = 0;
						let failCount = 0;
						for (const file of filesToDelete) {
							try {
								const formData = new FormData();
								formData.append('imageData', JSON.stringify(file));
								const response = await fetch('?/deleteMedia', { method: 'POST', body: formData });
								if (response.ok) {
									const result = await response.json();
									let data2 = result;
									if (result.type === 'success' && result.data) {
										data2 = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
									}
									const success = Array.isArray(data2) ? data2[0]?.success : data2?.success;
									if (success) {
										successCount++;
										successfullyDeletedIds.add(file._id);
									} else {
										failCount++;
									}
								} else {
									failCount++;
								}
							} catch (error) {
								logger.error('Error deleting file:', file.filename, error);
								failCount++;
							}
						}
						if (failCount === 0) {
							toaster.success({
								description: `Successfully deleted ${successCount} file${successCount > 1 ? 's' : ''}`
							});
						} else if (successCount === 0) {
							toaster.error({
								description: `Failed to delete ${failCount} file${failCount > 1 ? 's' : ''}`
							});
						} else {
							toaster.warning({
								description: `Deleted ${successCount} file${successCount > 1 ? 's' : ''}, ${failCount} failed`
							});
						}
						files = files.filter((f) => !successfullyDeletedIds.has(f._id));
						logger.info(`Removed ${successCount} files from UI. Remaining: ${files.length} files`);
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : String(error);
						logger.error('Error in bulk delete:', errorMessage);
						toaster.error({ description: `Error deleting media: ${errorMessage}` });
					}
				}
			});
		}
		async function handleEditImage(file) {
			console.log('handleEditImage called with:', file);
			if (!file) {
				console.warn('handleEditImage: File is null/undefined');
				return;
			}
			const url = file.url || mediaUrl(file);
			const imageWithUrl = { ...file, url };
			modalState.trigger(ImageEditorModal, {
				image: imageWithUrl,
				onsave: handleEditorSave,
				modalClasses: 'w-full h-full max-w-none max-h-none p-0'
			});
		}
		async function handleEditorSave(detail) {
			const { file } = detail;
			const formData = new FormData();
			formData.append('files', file);
			try {
				const response = await fetch('/mediagallery?/upload', { method: 'POST', body: formData });
				if (response.ok) {
					toaster.success({ description: 'Image saved successfully!' });
					fetchMediaFiles(true);
				} else {
					throw new Error('Failed to save edited image');
				}
			} catch (err) {
				toaster.error({ description: 'Error saving image' });
				logger.error('Error saving edited image', err);
			}
		}
		function handleUpdateImage(updatedFile) {
			const index2 = files.findIndex((f) => f._id === updatedFile._id);
			if (index2 !== -1) {
				files[index2] = updatedFile;
			}
		}
		$$renderer2.push(`<div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">`);
		PageTitle($$renderer2, {
			name: 'Media Gallery',
			icon: 'bi:images',
			showBackButton: true,
			backUrl: '/',
			onBackClick: (defaultBehavior) => {
				try {
					defaultBehavior();
				} catch (error) {
					logger.error('Navigation error:', error);
					goto();
				}
			}
		});
		$$renderer2.push(
			`<!----> <div class="lgd:mt-0 flex items-center justify-center gap-4 lg:justify-end"><button aria-label="Add folder" class="preset-filled-tertiary-500 btn gap-2"${attr('disabled', isLoading, true)}${attr('aria-busy', isLoading)}><iconify-icon icon="mdi:folder-add-outline" width="24"></iconify-icon> ${escape_html(isLoading ? 'Creating...' : 'Add folder')} `
		);
		if (isLoading) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<span class="loading loading-spinner loading-xs"></span>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--></button> <button aria-label="Add Media" class="preset-filled-primary-500 btn gap-2"><iconify-icon icon="carbon:add-filled" width="24"></iconify-icon> Add Media</button></div></div> `
		);
		Breadcrumb($$renderer2, {
			breadcrumb
		});
		$$renderer2.push(
			`<!----> <div class="wrapper overflow-auto"><div class="mb-8 flex w-full flex-col justify-center gap-1 md:hidden"><label for="globalSearch">Search</label> <div class="flex gap-2"><div class="input-group input-group-divider grid flex-1 grid-cols-[auto_1fr_auto]"><input id="globalSearch" type="text" placeholder="Search Media" class="input"${attr('value', globalSearchValue)}/> `
		);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--></div> <button aria-label="Advanced search" class="preset-filled-surface-500 btn" title="Advanced Search"><iconify-icon icon="mdi:magnify-plus-outline" width="24"></iconify-icon></button></div> <div class="mt-4 flex justify-between"><div class="flex flex-col"><label for="mediaType">Type</label> `
		);
		$$renderer2.select({ id: 'mediaType', value: selectedMediaType, class: 'input' }, ($$renderer3) => {
			$$renderer3.push(`<!--[-->`);
			const each_array = ensure_array_like(mediaTypes);
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let type = each_array[$$index];
				$$renderer3.option({ value: type.value }, ($$renderer4) => {
					$$renderer4.push(`${escape_html(type.label)}`);
				});
			}
			$$renderer3.push(`<!--]-->`);
		});
		$$renderer2.push(
			`</div> <div class="flex flex-col text-center"><label for="sortButton">Sort</label> <button id="sortButton" aria-label="Sort" class="preset-outline-surface-500 btn"><iconify-icon icon="flowbite:sort-outline" width="24"></iconify-icon></button></div> <div class="flex items-center justify-center text-center text-xs md:hidden"><div class="flex flex-col items-center justify-center"><div class="flex sm:divide-x sm:divide-gray-500">`
		);
		if (view === 'grid') {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<button aria-label="Table" class="btn flex flex-col items-center justify-center px-1"><p class="text-center text-xs">Display</p> <iconify-icon icon="material-symbols:list-alt-outline" height="44" style="color: text-black dark:text-white"></iconify-icon> <p class="text-xs">Table</p></button>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(
				`<button aria-label="Grid" class="btn flex flex-col items-center justify-center px-1"><p class="text-center text-xs">Display</p> <iconify-icon icon="material-symbols:grid-view-rounded" height="42" style="color: text-black dark:text-white"></iconify-icon> <p class="text-center text-xs">Grid</p></button>`
			);
		}
		$$renderer2.push(
			`<!--]--></div></div> <div class="flex flex-col items-center"><p class="text-xs">Size</p> <div class="flex divide-x divide-gray-500">`
		);
		if ((view === 'grid' && gridSize === 'tiny') || (view === 'table' && tableSize === 'tiny')) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<button type="button" aria-label="Tiny" class="px-1"><iconify-icon icon="material-symbols:apps" height="40" style="color:text-black dark:text-white"></iconify-icon> <p class="text-xs">Tiny</p></button>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
			if ((view === 'grid' && gridSize === 'small') || (view === 'table' && tableSize === 'small')) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<button type="button" aria-label="Small" class="px-1"><iconify-icon icon="material-symbols:background-grid-small-sharp" height="40" style="color:text-black dark:text-white"></iconify-icon> <p class="text-xs">Small</p></button>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
				if ((view === 'grid' && gridSize === 'medium') || (view === 'table' && tableSize === 'medium')) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<button type="button" aria-label="Medium" class="px-1"><iconify-icon icon="material-symbols:grid-on-sharp" height="40" style="color: text-black dark:text-white"></iconify-icon> <p class="text-xs">Medium</p></button>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
					$$renderer2.push(
						`<button type="button" aria-label="Large" class="px-1"><iconify-icon icon="material-symbols:grid-view" height="40" style="color: text-black dark:text-white"></iconify-icon> <p class="text-xs">Large</p></button>`
					);
				}
				$$renderer2.push(`<!--]-->`);
			}
			$$renderer2.push(`<!--]-->`);
		}
		$$renderer2.push(
			`<!--]--></div></div></div></div></div> <div class="mb-4 hidden items-end justify-between gap-4 md:flex"><div class="flex items-end gap-2"><div class="flex flex-col gap-1"><label for="globalSearchMd" class="text-sm font-medium">Search</label> <div class="input-group input-group-divider grid h-11 max-w-md grid-cols-[auto_1fr_auto_auto]"><input${attr('value', globalSearchValue)} id="globalSearchMd" type="text" placeholder="Search" class="input"/> `
		);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--></div></div> <button aria-label="Advanced search" class="preset-filled-surface-500 btn gap-2" title="Advanced Search"><iconify-icon icon="mdi:magnify-plus-outline" width="24"></iconify-icon> Advanced</button></div> <div class="flex items-end gap-4"><div class="flex flex-col gap-1"><label for="mediaTypeMd" class="text-sm font-medium">Type</label> <div class="input-group h-11">`
		);
		$$renderer2.select({ id: 'mediaTypeMd', value: selectedMediaType, class: 'select' }, ($$renderer3) => {
			$$renderer3.push(`<!--[-->`);
			const each_array_1 = ensure_array_like(mediaTypes);
			for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
				let type = each_array_1[$$index_1];
				$$renderer3.option({ value: type.value }, ($$renderer4) => {
					$$renderer4.push(`${escape_html(type.label)}`);
				});
			}
			$$renderer3.push(`<!--]-->`);
		});
		$$renderer2.push(
			`</div></div> <div class="flex flex-col gap-1 text-center"><label for="sortButton" class="text-sm font-medium">Sort</label> <button id="sortButton" class="preset-tonal btn h-11" aria-label="Sort"><iconify-icon icon="flowbite:sort-outline" width="24"></iconify-icon></button></div> <div class="flex flex-col items-center gap-1"><span class="text-sm font-medium">Display</span> <div class="h-11 flex divide-x divide-gray-500 border border-surface-500/30 rounded-token overflow-hidden"><button${attr_class(`h-full px-3 flex flex-col items-center justify-center transition-colors ${view === 'grid' ? 'bg-primary-500/20 text-primary-500' : 'hover:bg-surface-500/10'}`)} aria-label="Grid" title="Grid View"><iconify-icon icon="material-symbols:grid-view-rounded" height="20"></iconify-icon> <span class="text-[10px] hidden xl:inline">Grid</span></button> <button${attr_class(`h-full px-3 flex flex-col items-center justify-center transition-colors ${view === 'table' ? 'bg-primary-500/20 text-primary-500' : 'hover:bg-surface-500/10'}`)} aria-label="Table" title="Table View"><iconify-icon icon="material-symbols:list-alt-outline" height="20"></iconify-icon> <span class="text-[10px] hidden xl:inline">Table</span></button></div></div> <div class="flex flex-col items-center gap-1"><span class="text-sm font-medium">Size</span> <div class="h-11 flex divide-x divide-gray-500 border border-surface-500/30 rounded-token overflow-hidden">`
		);
		if ((view === 'grid' && gridSize === 'tiny') || (view === 'table' && tableSize === 'tiny')) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<button class="h-full px-3 flex flex-col items-center justify-center transition-colors hover:bg-surface-500/10" aria-label="Tiny - Click for Small" title="Tiny (Click to change)"><iconify-icon icon="material-symbols:apps" height="20"></iconify-icon> <span class="text-[10px] hidden xl:inline">Tiny</span></button>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
			if ((view === 'grid' && gridSize === 'small') || (view === 'table' && tableSize === 'small')) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<button class="h-full px-3 flex flex-col items-center justify-center transition-colors hover:bg-surface-500/10" aria-label="Small - Click for Medium" title="Small (Click to change)"><iconify-icon icon="material-symbols:background-grid-small-sharp" height="20"></iconify-icon> <span class="text-[10px] hidden xl:inline">Small</span></button>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
				if ((view === 'grid' && gridSize === 'medium') || (view === 'table' && tableSize === 'medium')) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<button class="h-full px-3 flex flex-col items-center justify-center transition-colors hover:bg-surface-500/10" aria-label="Medium - Click for Large" title="Medium (Click to change)"><iconify-icon icon="material-symbols:grid-on-sharp" height="20"></iconify-icon> <span class="text-[10px] hidden xl:inline">Medium</span></button>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
					$$renderer2.push(
						`<button class="h-full px-3 flex flex-col items-center justify-center transition-colors hover:bg-surface-500/10" aria-label="Large - Click for Tiny" title="Large (Click to change)"><iconify-icon icon="material-symbols:grid-view" height="20"></iconify-icon> <span class="text-[10px] hidden xl:inline">Large</span></button>`
					);
				}
				$$renderer2.push(`<!--]-->`);
			}
			$$renderer2.push(`<!--]-->`);
		}
		$$renderer2.push(`<!--]--></div></div></div></div> `);
		if (view === 'grid') {
			$$renderer2.push('<!--[-->');
			if (useVirtualScrolling) {
				$$renderer2.push('<!--[-->');
				VirtualMediaGrid($$renderer2, {
					filteredFiles,
					gridSize
				});
				$$renderer2.push(
					`<!----> <div class="alert preset-outline-surface-500 mt-4"><iconify-icon icon="mdi:lightning-bolt" width="20"></iconify-icon> <span class="text-sm">Virtual scrolling enabled for optimal performance with ${escape_html(filteredFiles.length)} files</span></div>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
				MediaGrid($$renderer2, {
					filteredFiles,
					gridSize,
					ondeleteImage: handleDeleteImage,
					onBulkDelete: handleBulkDelete,
					onsizechange: handleSizeChange,
					onEditImage: handleEditImage,
					onUpdateImage: handleUpdateImage
				});
			}
			$$renderer2.push(`<!--]-->`);
		} else {
			$$renderer2.push('<!--[!-->');
			MediaTable($$renderer2, {
				filteredFiles,
				tableSize: safeTableSize,
				ondeleteImage: handleDeleteImage,
				onEditImage: handleEditImage,
				onUpdateImage: handleUpdateImage,
				onDeleteFiles: handleBulkDelete
			});
		}
		$$renderer2.push(`<!--]--></div>  `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]-->`);
	});
}
export { _page as default };
//# sourceMappingURL=_page.svelte.js.map
