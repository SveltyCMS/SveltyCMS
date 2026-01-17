import 'clsx';
import { S as uploadmedia_title1 } from '../../../../chunks/_index.js';
import { P as PageTitle } from '../../../../chunks/PageTitle.js';
import { a as attr, e as ensure_array_like, d as escape_html } from '../../../../chunks/index5.js';
import '../../../../chunks/logger.js';
import '../../../../chunks/store.svelte.js';
import '@sveltejs/kit/internal';
import '../../../../chunks/exports.js';
import '../../../../chunks/utils3.js';
import '@sveltejs/kit/internal/server';
import '../../../../chunks/state.svelte.js';
import { T as Tooltip } from '../../../../chunks/anatomy2.js';
import { P as Portal } from '../../../../chunks/anatomy.js';
import { T as Tabs } from '../../../../chunks/anatomy3.js';
function LocalUpload($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let files = [];
		let isUploading = false;
		let objectUrls = /* @__PURE__ */ new Map();
		function getFileIcon(file) {
			const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
			switch (true) {
				case file.type?.startsWith('image/'):
					return 'fa-solid:image';
				case file.type?.startsWith('video/'):
					return 'fa-solid:video';
				case file.type?.startsWith('audio/'):
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
		function formatMimeType(mime) {
			if (!mime) return 'Unknown';
			const parts = mime.split('/');
			return parts[1] ? parts[1].toUpperCase() : parts[0].toUpperCase();
		}
		if (files.length === 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="mt-2 flex h-[200px] w-full max-w-full select-none flex-col items-center justify-center gap-4 rounded border-2 border-dashed border-surface-600 bg-secondary-50 dark:border-surface-500 dark:bg-surface-700" role="region" aria-label="File drop zone"><div class="grid grid-cols-6 items-center p-4"><iconify-icon icon="fa6-solid:file-arrow-up" width="40" aria-hidden="true"></iconify-icon> <div class="col-span-5 space-y-4 text-center"><p class="font-bold"><span class="text-tertiary-500 dark:text-primary-500">Media Upload</span> Drag files here to upload</p> <p class="text-sm opacity-75">Multiple files allowed</p> <button type="button" class="preset-filled-tertiary-500 btn mt-3 dark:preset-filled-primary-500"${attr('disabled', isUploading, true)}>Browse Files</button> <p class="mt-2 text-sm text-tertiary-500 dark:text-primary-500">Max File Size: 50 MB</p></div></div> <input type="file" class="sr-only" hidden="" multiple aria-hidden="true" tabindex="-1"/></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<div class="mb-5 text-center sm:text-left"><p class="text-center text-tertiary-500 dark:text-primary-500">This area facilitates the queuing and previewing of media files before they are officially uploaded to the gallery. Verify your selection below,
			then confirm to complete the transfer.</p></div> <div class="flex flex-col space-y-4"><div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"><!--[-->`);
			const each_array = ensure_array_like(files);
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let file = each_array[$$index];
				const fileKey = `${file.name}-${file.size}`;
				const previewUrl = objectUrls.get(fileKey);
				const iconName = getFileIcon(file);
				$$renderer2.push(
					`<div class="group relative overflow-hidden rounded border border-surface-200 shadow-sm transition-all hover:shadow-md dark:border-surface-500"><div class="absolute right-1 top-1 z-10 flex cursor-pointer shadow-sm">`
				);
				Tooltip($$renderer2, {
					positioning: { placement: 'top' },
					children: ($$renderer3) => {
						$$renderer3.push(`<!---->`);
						Tooltip.Trigger($$renderer3, {
							children: ($$renderer4) => {
								$$renderer4.push(
									`<button type="button" class="btn-icon rounded-full" aria-label="Remove file"><iconify-icon icon="material-symbols:delete" width="24" class="text-error-500"></iconify-icon></button>`
								);
							},
							$$slots: { default: true }
						});
						$$renderer3.push(`<!----> `);
						Portal($$renderer3, {
							children: ($$renderer4) => {
								$$renderer4.push(`<!---->`);
								Tooltip.Positioner($$renderer4, {
									children: ($$renderer5) => {
										$$renderer5.push(`<!---->`);
										Tooltip.Content($$renderer5, {
											class: 'rounded bg-surface-900 px-2 py-1 text-xs text-white shadow-xl dark:bg-surface-100 dark:text-black',
											children: ($$renderer6) => {
												$$renderer6.push(`<!---->Remove file <!---->`);
												Tooltip.Arrow($$renderer6, { class: 'fill-surface-900 dark:fill-surface-100' });
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
					},
					$$slots: { default: true }
				});
				$$renderer2.push(`<!----></div> <div class="flex aspect-square items-center justify-center">`);
				if (file.type?.startsWith('image/') && previewUrl) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`<img${attr('src', previewUrl)}${attr('alt', file.name)} class="h-full w-full object-contain"/>`);
				} else {
					$$renderer2.push('<!--[!-->');
					if (file.type?.startsWith('audio/') && previewUrl) {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(`<audio controls class="max-w-full"><source${attr('src', previewUrl)}${attr('type', file.type)}/></audio>`);
					} else {
						$$renderer2.push('<!--[!-->');
						$$renderer2.push(`<iconify-icon${attr('icon', iconName)} width="48" class="opacity-50"></iconify-icon>`);
					}
					$$renderer2.push(`<!--]-->`);
				}
				$$renderer2.push(
					`<!--]--></div> <div class="label overflow-hidden text-ellipsis whitespace-nowrap p-1 text-center font-bold text-xs text-tertiary-500 dark:text-primary-500"${attr('title', file.name)}>${escape_html(file.name)}</div> <div class="flex grow items-center justify-between p-1 text-white"><div class="bg-tertiary-500 dark:bg-primary-500/50 badge flex items-center gap-1 overflow-hidden"${attr('title', file.type)}><iconify-icon${attr('icon', iconName)} width="12" height="12"></iconify-icon> <span class="truncate text-[10px] uppercase">${escape_html(formatMimeType(file.type))}</span></div> <p class="bg-tertiary-500 dark:bg-primary-500/50 badge flex shrink-0 items-center gap-1 text-[10px]"><span>${escape_html((file.size / 1024).toFixed(2))}</span> KB</p></div></div>`
				);
			}
			$$renderer2.push(
				`<!--]--> <button type="button" class="btn preset-tonal flex-col items-center gap-2"><iconify-icon icon="mingcute:add-fill" width="32" class="text-tertiary-500 dark:text-primary-500"></iconify-icon> <span class="font-bold">Add Files</span></button></div> <input type="file" class="hidden" multiple/> <div class="flex items-center justify-between border-t border-surface-200 pt-4 dark:border-surface-700"><button type="button" class="btn preset-outlined-surface-500">Cancel</button> <button type="button" class="btn dark:preset-filled-primary-500 preset-filled-tertiary-500"${attr('disabled', isUploading, true)}>`
			);
			{
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(
					`<iconify-icon icon="mingcute:check-fill"></iconify-icon> <span>Upload ${escape_html(files.length)} File${escape_html(files.length !== 1 ? 's' : '')}</span>`
				);
			}
			$$renderer2.push(`<!--]--></button></div></div>`);
		}
		$$renderer2.push(`<!--]--> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function RemoteUpload($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let remoteUrls = [];
		$$renderer2.push(
			`<div class="space-y-4"><textarea placeholder="Paste Remote URLs here, one per line..." rows="6" class="textarea w-full bg-secondary-50 dark:bg-secondary-800">`
		);
		const $$body = escape_html(remoteUrls);
		if ($$body) {
			$$renderer2.push(`${$$body}`);
		}
		$$renderer2.push(`</textarea> <button class="preset-filled-tertiary-500 btn mt-2 dark:preset-filled-primary-500">Upload URLs</button></div>`);
	});
}
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let tabSet = '0';
		$$renderer2.push(`<div class="mb-4 flex items-center justify-between">`);
		PageTitle($$renderer2, {
			name: uploadmedia_title1(),
			icon: 'bi:images',
			iconColor: 'text-tertiary-500 dark:text-primary-500'
		});
		$$renderer2.push(
			`<!----> <button aria-label="Back" class="preset-outlined-tertiary-500 btn-icon rounded-full dark:preset-outlined-primary-500"><iconify-icon icon="ri:arrow-left-line" width="20"></iconify-icon></button></div> <div class="wrapper">`
		);
		Tabs($$renderer2, {
			value: tabSet,
			onValueChange: (e) => (tabSet = e.value),
			children: ($$renderer3) => {
				$$renderer3.push(`<!---->`);
				Tabs.List($$renderer3, {
					class: 'flex border-b border-surface-200-800 font-bold',
					children: ($$renderer4) => {
						$$renderer4.push(`<!---->`);
						Tabs.Trigger($$renderer4, {
							value: '0',
							class: 'flex-1',
							children: ($$renderer5) => {
								$$renderer5.push(
									`<div class="flex items-center justify-center gap-2 py-4"><iconify-icon icon="material-symbols:database" width="28"></iconify-icon> <p class="text-tertiary-500 dark:text-primary-500">Local Upload</p></div>`
								);
							},
							$$slots: { default: true }
						});
						$$renderer4.push(`<!----> <!---->`);
						Tabs.Trigger($$renderer4, {
							value: '1',
							class: 'flex-1',
							children: ($$renderer5) => {
								$$renderer5.push(
									`<div class="flex items-center justify-center gap-2 py-4"><iconify-icon icon="arcticons:tautulli-remote" width="28"></iconify-icon> <p class="text-tertiary-500 dark:text-primary-500">Remote Upload</p></div>`
								);
							},
							$$slots: { default: true }
						});
						$$renderer4.push(`<!----> <!---->`);
						Tabs.Indicator($$renderer4, {});
						$$renderer4.push(`<!---->`);
					},
					$$slots: { default: true }
				});
				$$renderer3.push(`<!----> <!---->`);
				Tabs.Content($$renderer3, {
					value: '0',
					children: ($$renderer4) => {
						$$renderer4.push(`<div class="p-4">`);
						LocalUpload($$renderer4);
						$$renderer4.push(`<!----></div>`);
					},
					$$slots: { default: true }
				});
				$$renderer3.push(`<!----> <!---->`);
				Tabs.Content($$renderer3, {
					value: '1',
					children: ($$renderer4) => {
						$$renderer4.push(`<div class="p-4">`);
						RemoteUpload($$renderer4);
						$$renderer4.push(`<!----></div>`);
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
