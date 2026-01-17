import { g as attr_class, i as clsx, d as escape_html, a as attr, h as bind_props, j as getContext, b as attr_style } from './index5.js';
import { m as meta_data, g as getFieldName } from './utils.js';
import './logger.js';
import {
	cl as widget_imageupload_upload3,
	cm as widget_imageupload_drag3,
	cn as widget_imageupload_replace3,
	co as widget_imageupload_allowed3,
	cp as widget_imageupload_browsenew4,
	cq as widget_imageupload_selectmedia4,
	cr as widget_imageupload_name3,
	cs as widget_imageupload_size3
} from './_index.js';
import { v as validationStore } from './store.svelte.js';
import { m as mode } from './collectionStore.svelte.js';
import { twMerge } from 'tailwind-merge';
import { i as imageEditorStore } from './imageEditorStore.svelte.js';
import 'konva';
import { pipe, instance, check, object, string, number, record, union, parse } from 'valibot';
function FileInput($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { value = void 0, multiple = false, show = true, className = '', onChange } = $$props;
		if (show) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div role="cell" tabindex="0"${attr_class(clsx(twMerge('relative mt-2 flex h-[200px] w-full max-w-full select-none flex-col items-center justify-center gap-4 rounded border-2 border-dashed border-surface-600 bg-surface-200 dark:border-surface-500 dark:bg-surface-700', className)))}><div class="grid grid-cols-6 items-center p-4"><iconify-icon icon="fa6-solid:file-arrow-up" width="40"></iconify-icon> <span class="text-white">test</span> <div class="col-span-5">`
			);
			if (!show) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<p class="font-bold"><span class="text-tertiary-500 dark:text-primary-500">${escape_html(widget_imageupload_upload3())}</span> ${escape_html(widget_imageupload_drag3())}</p>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(
					`<p class="font-bold"><span class="text-tertiary-500 dark:text-primary-500">${escape_html(widget_imageupload_replace3())}</span> ${escape_html(widget_imageupload_drag3())}</p>`
				);
			}
			$$renderer2.push(
				`<!--]--> <p class="text-sm opacity-75">${escape_html(widget_imageupload_allowed3())}.</p> <div class="flex w-full justify-center gap-2"><button${attr('aria-label', widget_imageupload_browsenew4())} class="preset-filled-tertiary-500 btn mt-3 dark:preset-filled-primary-500">${escape_html(widget_imageupload_browsenew4())}</button> <button${attr('aria-label', widget_imageupload_selectmedia4())} class="preset-filled-tertiary-500 btn mt-3 dark:preset-filled-primary-500">${escape_html(widget_imageupload_selectmedia4())}</button></div></div></div> <input type="file" accept="image/*,image/webp,image/avif,image/svg+xml" hidden=""${attr('multiple', multiple, true)}/></div> `
			);
			{
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]-->`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]-->`);
		bind_props($$props, { value, multiple, show });
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
function Tool$6($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let transformer = null;
		let annotations = [];
		function unbindTool() {
			return;
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
function Tool$5($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let regions = [];
		let { onCancel } = $$props;
		function unbindStageEvents() {
			return;
		}
		function cleanupBlurElements(destroyRegions = true) {
			if (destroyRegions) {
				[...regions].forEach((region) => region.destroy());
				regions = [];
			} else {
				regions.forEach((region) => region.hideUI());
			}
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
		$$renderer2.push(`<!---->// imageEditor/widgets/Rotate/Tool.svelte /** * @file src/components/imageEditor/widgets/Rotate/Tool.svelte * @component * Rotate tool for rotating
and flipping images */`);
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
		getContext('watermarkPreset');
		function unbindTool() {
			return;
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
Object.values(modules)
	.map((m) => {
		const mod = m;
		return mod.default ?? mod.editorWidget;
	})
	.filter((w) => !!w);
const getWidgetData = async (_data, field, value) => {
	if (_data && _data instanceof File) {
		_data.path = field.path;
	}
	if (value && !(value instanceof File) && _data && !(_data instanceof File) && _data?._id !== value?._id && value?._id && mode.value === 'edit') {
		meta_data.add('media_images_remove', [value._id.toString()]);
	}
	return _data || mode.value === 'create' ? _data : { _id: value?._id };
};
function MediaUpload($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let validationError = null;
		let debounceTimeout;
		let { field, value = void 0 } = $$props;
		field.watermark;
		const validImageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml'];
		const fileSchema = pipe(
			instance(File),
			check((input) => validImageTypes.includes(input.type), 'Invalid file format')
		);
		const thumbnailSchema = object({ width: number(), height: number(), url: string() });
		const mediaImageSchema = object({
			_id: string(),
			name: string(),
			type: string(),
			size: number(),
			path: string(),
			thumbnails: record(string(), thumbnailSchema),
			createdAt: number(),
			updatedAt: number()
		});
		const widgetSchema = union([fileSchema, mediaImageSchema]);
		function validateSchema(data) {
			try {
				parse(widgetSchema, data);
				validationStore.clearError(getFieldName(field));
				return null;
			} catch (error) {
				if (error.issues) {
					const valiError = error;
					const errorMessage = valiError.issues[0]?.message || 'Invalid input';
					validationStore.setError(getFieldName(field), errorMessage);
					return errorMessage;
				}
				return 'Invalid input';
			}
		}
		function validateInput() {
			if (debounceTimeout) clearTimeout(debounceTimeout);
			debounceTimeout = window.setTimeout(() => {
				validationError = validateSchema(value);
			}, 300);
		}
		let focalPoint = { x: 50, y: 50 };
		async function WidgetDataExport() {
			return getWidgetData(value, field, value);
		}
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			$$renderer3.push(`<div class="relative mb-4 min-h-1">`);
			if (!value) {
				$$renderer3.push('<!--[-->');
				$$renderer3.push(
					`<div${attr_class('rounded-lg border-2 border-dashed border-transparent', void 0, { '!border-error-500': !!validationError })}>`
				);
				FileInput($$renderer3, {
					onChange: validateInput,
					get value() {
						return value;
					},
					set value($$value) {
						value = $$value;
						$$settled = false;
					},
					get multiple() {
						return field.multiupload;
					},
					set multiple($$value) {
						field.multiupload = $$value;
						$$settled = false;
					}
				});
				$$renderer3.push(`<!----></div>`);
			} else {
				$$renderer3.push('<!--[!-->');
				$$renderer3.push(
					`<div${attr_class('flex w-full max-w-full flex-col border-2 border-dashed border-surface-600 bg-surface-200 dark:border-surface-500 dark:bg-surface-700', void 0, { error: !!validationError })}><div class="mx-2 flex flex-col gap-2"><div class="flex items-center justify-between gap-2"><p class="text-left">${escape_html(widget_imageupload_name3())} <span class="text-tertiary-500 dark:text-primary-500">${escape_html(value instanceof File ? value.name : value.path)}</span></p> <p class="text-left">${escape_html(widget_imageupload_size3())} <span class="text-tertiary-500 dark:text-primary-500">${escape_html(((value.size ?? 0) / 1024).toFixed(2))} KB</span></p></div> <div class="flex items-center justify-between">`
				);
				{
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="relative col-span-11 m-auto"><img${attr('src', value instanceof File ? URL.createObjectURL(value) : value.thumbnails?.sm?.url || value.url)} alt="Preview" class="max-h-[200px] max-w-[500px] rounded"/> `
					);
					if (value && !(value instanceof File)) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<div class="absolute cursor-move"${attr_style(`left: ${focalPoint.x}%; top: ${focalPoint.y}%; transform: translate(-50%, -50%);`)} role="button" tabindex="0" aria-label="Set focal point"><iconify-icon icon="mdi:plus-circle-outline" width="24" class="text-primary-500 drop-shadow-lg"></iconify-icon></div>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--></div>`);
				}
				$$renderer3.push(
					`<!--]--> <div class="col-span-1 flex flex-col items-end justify-between gap-2 p-2"><button aria-label="Edit image" class="preset-outlined-surface-500 btn-icon" title="Edit image"><iconify-icon icon="material-symbols:edit" width="24" class="text-primary-500"></iconify-icon></button> <button aria-label="Flip" class="preset-outlined-surface-500 btn-icon" title="Flip details"><iconify-icon icon="uiw:reload" width="24"${attr_class(clsx('text-white  transition-transform duration-300'))}></iconify-icon></button> <button aria-label="Delete" class="preset-outlined-surface-500 btn-icon" title="Delete image"><iconify-icon icon="material-symbols:delete-outline" width="30" class="text-error-500"></iconify-icon></button></div></div></div></div>`
				);
			}
			$$renderer3.push(`<!--]--> `);
			if (validationError) {
				$$renderer3.push('<!--[-->');
				$$renderer3.push(
					`<p${attr('id', `${getFieldName(field)}-error`)} class="absolute -bottom-4 left-0 w-full text-center text-xs text-error-500" role="alert">${escape_html(validationError)}</p>`
				);
			} else {
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]--> `);
			{
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
		bind_props($$props, { value, WidgetDataExport });
	});
}
export { MediaUpload as default };
//# sourceMappingURL=MediaUpload.js.map
