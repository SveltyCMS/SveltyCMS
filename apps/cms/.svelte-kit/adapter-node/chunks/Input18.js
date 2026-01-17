import { g as attr_class, c as stringify, e as ensure_array_like, a as attr, d as escape_html, i as clsx, h as bind_props } from './index5.js';
import { o as onDestroy } from './index-server.js';
import '@tiptap/starter-kit';
import '@tiptap/extension-link';
import '@tiptap/extension-placeholder';
import '@tiptap/extension-table';
import '@tiptap/extension-table-cell';
import '@tiptap/extension-table-header';
import '@tiptap/extension-table-row';
import '@tiptap/extension-text-align';
import '@tiptap/extension-underline';
import '@tiptap/extension-youtube';
import '@tiptap/extension-character-count';
import '@tiptap/extension-color';
import '@tiptap/extension-font-family';
import { Image } from '@tiptap/extension-image';
import { TextStyle } from '@tiptap/extension-text-style';
import './utils.js';
import { a as app } from './store.svelte.js';
import { s as showModal } from './modalUtils.js';
const DESCRIPTION_STYLE =
	'text-align: center;position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0, 0, 0, .5); color: #fff; padding: 5px; font-size: 16px;';
Image.extend({
	addOptions() {
		return {
			inline: false,
			HTMLAttributes: {},
			resize: false,
			...this.parent?.(),
			id: null,
			media_image: null,
			allowBase64: true,
			sizes: ['25%', '50%', '75%', '100%']
		};
	},
	addCommands() {
		return {
			...this.parent?.(),
			setImageFloat:
				(side) =>
				({ commands }) =>
					commands.updateAttributes(this.name, { float: side }),
			setImageDescription:
				(description) =>
				({ commands }) =>
					commands.updateAttributes(this.name, { description })
		};
	},
	addAttributes() {
		return {
			id: {
				default: null
			},
			storage_image: {
				default: null,
				parseHTML: (element) => element.querySelector('img').getAttribute('storage_image')
			},
			src: {
				default: null,
				parseHTML: (element) => element.querySelector('img').getAttribute('src')
			},
			alt: {
				default: null,
				parseHTML: (element) => element.querySelector('img').getAttribute('alt')
			},
			float: {
				default: 'unset',
				parseHTML: (element) => element.style.float
			},
			w: {
				default: '200px',
				parseHTML: (element) => element.style.width
			},
			h: {
				default: null,
				parseHTML: (element) => element.style.height
			},
			margin: {
				default: 'unset',
				parseHTML: (element) => element.style.margin
			},
			textAlign: {
				default: 'unset',
				parseHTML: (element) => element.style.textAlign
			},
			default: {
				default: false
			},
			description: {
				default: '',
				parseHTML: (element) => {
					return element.querySelector('.description')?.innerText || '';
				}
			},
			style: {
				default: null,
				parseHTML: (element) => {
					return element.style.cssText;
				}
			}
		};
	},
	renderHTML({ HTMLAttributes }) {
		const { float, w, h, margin, textAlign, description, ...rest } = HTMLAttributes;
		return [
			'div',
			{
				style: `text-align: ${textAlign};float: ${float};width: ${w};height: ${h}; margin: ${margin}; position: relative;`
			},
			['img', this.options.HTMLAttributes, rest],
			description
				? [
						'div',
						{
							class: 'description',
							style: DESCRIPTION_STYLE
						},
						description
					]
				: ''
		];
	},
	parseHTML() {
		return [
			{
				tag: 'div[style*="float"]',
				getAttrs: (node) => {
					if (node.querySelector('img')) {
						return {};
					}
					return false;
				}
			},
			{
				tag: 'img[src]',
				getAttrs: (node) => {
					if (node.closest('div[style*="float"]')) {
						return false;
					}
					return {};
				}
			}
		];
	},
	addNodeView() {
		return ({ editor, node, getPos }) => {
			const nodeAttrs = node.attrs;
			nodeAttrs._ = null;
			const container = document.createElement('div');
			container.style.position = 'relative';
			container.style.display = 'inline-block';
			const safeFloat = ['left', 'right', 'unset', 'none'].includes(nodeAttrs.float) ? nodeAttrs.float : 'unset';
			container.style.float = safeFloat;
			container.style.lineHeight = '0';
			const resizer = document.createElement('div');
			resizer.style.position = 'relative';
			const safeWidth = String(nodeAttrs.w || '200px').match(/^\d+(%|px)$/) ? String(nodeAttrs.w) : '200px';
			const safeHeight = nodeAttrs.h && String(nodeAttrs.h).match(/^\d+(%|px)$/) ? String(nodeAttrs.h) : 'auto';
			resizer.style.width = safeWidth;
			resizer.style.height = safeHeight;
			resizer.style.display = 'inline-block';
			const img = document.createElement('img');
			img.setAttribute('src', nodeAttrs.src);
			img.setAttribute('alt', nodeAttrs.alt);
			img.style.width = '100%';
			img.style.height = '100%';
			img.style.cursor = 'pointer';
			resizer.appendChild(img);
			container.appendChild(resizer);
			if (nodeAttrs.description) {
				const desc = document.createElement('div');
				desc.textContent = nodeAttrs.description;
				desc.style.cssText = DESCRIPTION_STYLE;
				container.appendChild(desc);
			}
			const knob1 = document.createElement('div');
			const knob2 = document.createElement('div');
			knob1.style.cssText = 'cursor: ew-resize;width: 15px; height: 100%;  position: absolute; top:0;left:0;transform:translateX(-50%)';
			knob2.style.cssText = 'cursor: ew-resize;width: 15px; height: 100%;  position: absolute; top:0;right:0;transform:translateX(50%)';
			resizer.appendChild(knob1);
			resizer.appendChild(knob2);
			knob1.onpointerdown = (e) => knobDrag(e, knob1, 'left', resizer, nodeAttrs);
			knob2.onpointerdown = (e) => knobDrag(e, knob2, 'right', resizer, nodeAttrs);
			let isDragging = false;
			const onDrag = (e) => {
				if (!isDragging) return;
				const newWidth = e.clientX - resizer.getBoundingClientRect().left;
				resizer.style.width = `${newWidth}px`;
				preserveAspectRatio(resizer, nodeAttrs, `${newWidth}px`, e.shiftKey);
			};
			const onStopDrag = () => {
				isDragging = false;
				document.removeEventListener('mousemove', onDrag);
				document.removeEventListener('mouseup', onStopDrag);
				if (typeof getPos === 'function') {
					const pos = getPos();
					if (pos !== void 0) {
						editor.view.dispatch(
							editor.view.state.tr.setNodeMarkup(pos, void 0, {
								...nodeAttrs,
								w: resizer.style.width,
								h: resizer.style.height
							})
						);
					}
				}
			};
			img.onmousedown = (e) => {
				e.preventDefault();
				isDragging = true;
				document.addEventListener('mousemove', onDrag);
				document.addEventListener('mouseup', onStopDrag);
			};
			return {
				dom: container
			};
		};
	}
});
function preserveAspectRatio(resizer, nodeAttrs, width, preserveRatio = true) {
	if (!preserveRatio) return;
	const img = resizer.querySelector('img');
	if (!img) return;
	const naturalWidth = img.naturalWidth;
	const naturalHeight = img.naturalHeight;
	if (naturalWidth && naturalHeight) {
		const ratio = naturalHeight / naturalWidth;
		const numWidth = parseInt(width);
		const newHeight = Math.round(numWidth * ratio);
		nodeAttrs.h = resizer.style.height = `${newHeight}px`;
	}
}
function knobDrag(e, knob, side, resizer, nodeAttrs) {
	e.preventDefault();
	e.stopPropagation();
	const shouldPreserveAspectRatio = e.shiftKey;
	knob.setPointerCapture(e.pointerId);
	knob.onpointermove = (e2) => {
		if (side == 'left' || side == 'right') {
			const currentWidth = parseInt(resizer.style.width, 10);
			const dx = side === 'left' ? e2.movementX * -1 : e2.movementX;
			const newWidth = currentWidth + dx;
			resizer.style.width = `${newWidth}px`;
			nodeAttrs.w = `${newWidth}px`;
			preserveAspectRatio(resizer, nodeAttrs, `${newWidth}px`, shouldPreserveAspectRatio);
		} else {
			const currentHeight = parseInt(resizer.style.height, 10);
			const dy = side === 'top' ? e2.movementY * -1 : e2.movementY;
			const newHeight = currentHeight + dy;
			resizer.style.height = `${newHeight}px`;
			nodeAttrs.h = `${newHeight}px`;
		}
	};
	knob.onpointerup = () => {
		knob.onpointermove = null;
		knob.onpointerup = null;
	};
}
TextStyle.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			fontSize: {
				default: null,
				parseHTML: (element) => {
					const fontSize = element.style.fontSize;
					if (!fontSize) return null;
					return fontSize.replace(/px$/, '');
				},
				renderHTML: (attributes) => {
					if (!attributes.fontSize) {
						return {};
					}
					const size = attributes.fontSize;
					const fontSize = /^\d+$/.test(String(size)) ? `${size}px` : size;
					return {
						style: `font-size: ${fontSize}`
					};
				}
			}
		};
	},
	addCommands() {
		return {
			...this.parent?.(),
			setFontSize:
				(fontSize) =>
				({ chain }) => {
					const size = String(fontSize);
					const sanitized = size.match(/^\d+(\.\d+)?(px|em|rem|%)$/) ? size : '16px';
					return chain().focus().setMark(this.name, { fontSize: sanitized }).run();
				},
			unsetFontSize:
				() =>
				({ chain }) => {
					return chain().focus().setMark(this.name, { fontSize: null }).removeEmptyTextStyle().run();
				}
		};
	}
});
function Input($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { field, value = void 0, error } = $$props;
		field.translated ? app.contentLanguage : 'default';
		let editor = null;
		let isScrolled = false;
		let showSlashMenu = false;
		let showSource = false;
		let activeDropdown = null;
		let colorInput;
		let hoverRows = 0;
		let hoverCols = 0;
		function closeDropdowns() {
			activeDropdown = null;
		}
		function openMediaLibrary() {
			showModal({
				component: 'mediaLibraryModal',
				response: (files) => {
					if (files && files.length > 0) {
						files[0];
					}
				}
			});
		}
		async function pasteUnformatted() {
			try {
				const text = await navigator.clipboard.readText();
				editor?.chain().focus().insertContent(text).run();
			} catch (err) {
				console.error('Failed to read clipboard:', err);
				alert('Could not access clipboard. Please check permissions.');
			}
		}
		function setVideo() {
			prompt('Enter YouTube URL');
		}
		const toolbarGroups = [
			{
				buttons: [
					{
						type: 'button',
						icon: 'arrow-u-left-top',
						label: 'Undo',
						shortcut: 'Ctrl+Z',
						cmd: () => editor?.chain().focus().undo().run(),
						active: () => false
					},
					{
						type: 'button',
						icon: 'arrow-u-right-top',
						label: 'Redo',
						shortcut: 'Ctrl+Shift+Z',
						cmd: () => editor?.chain().focus().redo().run(),
						active: () => false
					}
				]
			},
			{
				buttons: [
					{
						type: 'button',
						icon: 'format-bold',
						label: 'Bold',
						shortcut: 'Ctrl+B',
						cmd: () => editor?.chain().focus().toggleBold().run(),
						active: () => false
					},
					{
						type: 'button',
						icon: 'format-italic',
						label: 'Italic',
						shortcut: 'Ctrl+I',
						cmd: () => editor?.chain().focus().toggleItalic().run(),
						active: () => false
					},
					{
						type: 'button',
						icon: 'format-underlined',
						label: 'Underline',
						shortcut: 'Ctrl+U',
						cmd: () => editor?.chain().focus().toggleUnderline().run(),
						active: () => false
					},
					{
						type: 'button',
						icon: 'format-strikethrough-variant',
						label: 'Strikethrough',
						cmd: () => editor?.chain().focus().toggleStrike().run(),
						active: () => false
					},
					{
						type: 'button',
						icon: 'format-clear',
						label: 'Clear Formatting',
						cmd: () => editor?.chain().focus().unsetAllMarks().run(),
						active: () => false
					}
				]
			},
			{
				buttons: [
					{
						type: 'dropdown',
						label: 'Color',
						icon: 'palette',
						items: [
							{
								label: 'Default',
								cmd: () => editor?.chain().focus().unsetColor().run(),
								active: () => true
							},
							{
								label: 'Custom...',
								cmd: () => colorInput?.click(),
								active: () => false
							}
						]
					},
					{
						type: 'dropdown',
						label: 'Font',
						items: [
							{
								label: 'Default',
								cmd: () => editor?.chain().focus().unsetFontFamily().run(),
								active: () => true
							},
							{
								label: 'Inter',
								cmd: () => editor?.chain().focus().setFontFamily('Inter').run(),
								active: () => false
							},
							{
								label: 'Comic Sans',
								cmd: () => editor?.chain().focus().setFontFamily('Comic Sans MS, Comic Sans').run(),
								active: () => false
							},
							{
								label: 'Serif',
								cmd: () => editor?.chain().focus().setFontFamily('serif').run(),
								active: () => false
							},
							{
								label: 'Monospace',
								cmd: () => editor?.chain().focus().setFontFamily('monospace').run(),
								active: () => false
							},
							{
								label: 'Cursive',
								cmd: () => editor?.chain().focus().setFontFamily('cursive').run(),
								active: () => false
							}
						]
					},
					{
						type: 'dropdown',
						label: 'Text',
						items: [
							{
								label: 'Paragraph',
								cmd: () => editor?.chain().focus().setParagraph().run(),
								active: () => false
							},
							{
								label: 'Heading 1',
								cmd: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
								active: () => false
							},
							{
								label: 'Heading 2',
								cmd: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
								active: () => false
							},
							{
								label: 'Heading 3',
								cmd: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
								active: () => false
							}
						]
					}
				]
			},
			{
				buttons: [
					{
						type: 'button',
						icon: 'format-list-bulleted',
						label: 'Bullet List',
						cmd: () => editor?.chain().focus().toggleBulletList().run(),
						active: () => false
					},
					{
						type: 'button',
						icon: 'format-list-numbered',
						label: 'Numbered List',
						cmd: () => editor?.chain().focus().toggleOrderedList().run(),
						active: () => false
					}
				]
			},
			{
				buttons: [
					{
						type: 'button',
						icon: 'link',
						label: 'Link',
						cmd: () =>
							editor
								?.chain()
								.focus()
								.setLink({ href: prompt('Enter URL') || '' })
								.run()
					},
					{
						type: 'button',
						icon: 'image',
						label: 'Image',
						cmd: openMediaLibrary
					},
					{
						type: 'button',
						icon: 'youtube',
						label: 'Video',
						cmd: setVideo
					},
					{ type: 'dropdown', icon: 'table', label: 'Table' },
					{
						type: 'button',
						icon: 'code-tags',
						label: 'Code Block',
						cmd: () => editor?.chain().focus().toggleCodeBlock().run(),
						active: () => false
					}
				]
			},
			{
				buttons: [
					{
						type: 'button',
						icon: 'format-align-left',
						label: 'Align Left',
						cmd: () => editor?.chain().focus().setTextAlign('left').run(),
						active: () => false
					},
					{
						type: 'button',
						icon: 'format-align-center',
						label: 'Align Center',
						cmd: () => editor?.chain().focus().setTextAlign('center').run(),
						active: () => false
					},
					{
						type: 'button',
						icon: 'format-align-right',
						label: 'Align Right',
						cmd: () => editor?.chain().focus().setTextAlign('right').run(),
						active: () => false
					},
					{
						type: 'button',
						icon: 'format-quote-close',
						label: 'Blockquote',
						cmd: () => editor?.chain().focus().toggleBlockquote().run(),
						active: () => false
					}
				]
			},
			{
				condition: () => !!field.aiEnabled,
				buttons: [
					{
						type: 'button',
						icon: 'sparkles',
						label: 'AI Command',
						shortcut: '/',
						cmd: () => {
							showSlashMenu = true;
						}
					}
				]
			},
			{
				buttons: [
					{
						type: 'button',
						icon: 'content-paste',
						label: 'Paste Plain Text',
						cmd: pasteUnformatted
					},
					{
						type: 'button',
						icon: 'xml',
						label: 'Source View',
						cmd: () => (showSource = !showSource),
						active: () => showSource
					}
				]
			}
		];
		function handleScroll() {
			isScrolled = window.scrollY > 120;
		}
		onDestroy(() => {
			window.removeEventListener('scroll', handleScroll);
			window.removeEventListener('click', closeDropdowns);
		});
		$$renderer2.push(
			`<div${attr_class(`my-2 relative overflow-hidden rounded border ${stringify(error ? 'border-red-500 ring-2 ring-red-500 ring-opacity-50' : 'border-surface-200 dark:text-surface-50')} bg-white dark:bg-surface-900 shadow-xl`)}><div${attr_class(`border-b border-surface-200 dark:border-surface-800 bg-surface-50/95 dark:bg-surface-800/95 backdrop-blur-sm px-2 transition-all duration-300 ${stringify(isScrolled ? 'fixed inset-x-0 top-0 z-50 shadow-lg' : '')}`)}><div class="w-full flex max-w-none flex-wrap items-center gap-1"><!--[-->`
		);
		const each_array = ensure_array_like(toolbarGroups);
		for (let $$index_4 = 0, $$length = each_array.length; $$index_4 < $$length; $$index_4++) {
			let group = each_array[$$index_4];
			if (!group.condition || group.condition()) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<div class="flex items-center gap-1"><!--[-->`);
				const each_array_1 = ensure_array_like(group.buttons);
				for (let $$index_3 = 0, $$length2 = each_array_1.length; $$index_3 < $$length2; $$index_3++) {
					let btn = each_array_1[$$index_3];
					if (btn.type === 'dropdown') {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(
							`<div class="relative"><button${attr_class(`flex items-center gap-1 rounded px-2 py-1.5 text-sm font-medium hover:bg-surface-200 dark:hover:bg-white/20 transition ${stringify(activeDropdown === btn.label ? 'bg-surface-200 dark:bg-white/20' : '')} text-surface-900 dark:text-white`)}${attr('title', btn.label)}>`
						);
						if (btn.icon) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(`<iconify-icon${attr('icon', `mdi:${stringify(btn.icon)}`)} width="20"></iconify-icon>`);
						} else {
							$$renderer2.push('<!--[!-->');
						}
						$$renderer2.push(`<!--]--> `);
						if (!btn.icon || btn.label !== 'Table') {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(
								`<span${attr_class(clsx(btn.icon ? 'hidden sm:inline' : ''))}>${escape_html(btn.label)}</span> <iconify-icon icon="mdi:chevron-down"></iconify-icon>`
							);
						} else {
							$$renderer2.push('<!--[!-->');
						}
						$$renderer2.push(`<!--]--></button> `);
						if (activeDropdown === btn.label) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(
								`<div class="absolute top-full left-0 mt-1 min-w-[180px] rounded-lg border border-surface-200 bg-white p-1 shadow-lg dark:text-surface-50 dark:bg-surface-900 z-50 ring-1 ring-black/5">`
							);
							if (btn.label === 'Table') {
								$$renderer2.push('<!--[-->');
								$$renderer2.push(
									`<div class="p-2 w-48"><div class="mb-2 text-xs font-medium text-surface-500 dark:text-surface-50 text-center">${escape_html(1)} x ${escape_html(1)}</div> <div class="grid grid-cols-5 gap-1" role="grid" tabindex="0"><!--[-->`
								);
								const each_array_2 = ensure_array_like(Array(5));
								for (let r = 0, $$length3 = each_array_2.length; r < $$length3; r++) {
									each_array_2[r];
									$$renderer2.push(`<!--[-->`);
									const each_array_3 = ensure_array_like(Array(5));
									for (let c = 0, $$length4 = each_array_3.length; c < $$length4; c++) {
										each_array_3[c];
										$$renderer2.push(
											`<button${attr_class(`w-8 h-8 rounded-sm border transition-colors ${stringify(r < hoverRows && c < hoverCols ? 'bg-blue-100 border-blue-500 dark:bg-blue-500/30 dark:border-blue-400' : 'bg-surface-50 border-surface-200 dark:bg-surface-800 dark:text-surface-50')}`)}${attr('aria-label', `${stringify(r + 1)} by ${stringify(c + 1)} table`)}></button>`
										);
									}
									$$renderer2.push(`<!--]-->`);
								}
								$$renderer2.push(`<!--]--></div></div>`);
							} else {
								$$renderer2.push('<!--[!-->');
								if (btn.items) {
									$$renderer2.push('<!--[-->');
									$$renderer2.push(`<!--[-->`);
									const each_array_4 = ensure_array_like(btn.items);
									for (let $$index_2 = 0, $$length3 = each_array_4.length; $$index_2 < $$length3; $$index_2++) {
										let item = each_array_4[$$index_2];
										$$renderer2.push(
											`<button${attr_class(`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-100 dark:hover:bg-white/20 ${stringify(item.active() ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'text-surface-700 dark:text-surface-300')}`)}>${escape_html(item.label)}</button>`
										);
									}
									$$renderer2.push(`<!--]-->`);
								} else {
									$$renderer2.push('<!--[!-->');
								}
								$$renderer2.push(`<!--]-->`);
							}
							$$renderer2.push(`<!--]--></div>`);
						} else {
							$$renderer2.push('<!--[!-->');
						}
						$$renderer2.push(`<!--]--></div>`);
					} else {
						$$renderer2.push('<!--[!-->');
						$$renderer2.push(
							`<button${attr_class(`rounded-lg p-2 hover:bg-surface-100 dark:hover:bg-white/10 transition-all ${stringify(btn.active?.() ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500' : 'text-surface-900 dark:text-white')}`)}${attr('aria-label', btn.label)}${attr('title', btn.shortcut ? `${btn.label} (${btn.shortcut})` : btn.label)}><iconify-icon${attr('icon', `mdi:${stringify(btn.icon)}`)} width="20"></iconify-icon></button>`
						);
					}
					$$renderer2.push(`<!--]-->`);
				}
				$$renderer2.push(`<!--]--> <div class="h-5 w-px bg-surface-300 dark:bg-surface-700 mx-1"></div></div>`);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]-->`);
		}
		$$renderer2.push(
			`<!--]--></div></div> <div${attr_class(`prose dark:prose-invert max-w-none px-6 py-4 min-h-96 focus:outline-none leading-relaxed caret-blue-600 dark:caret-blue-400 ${stringify(showSource ? 'hidden' : '')}`)}></div>  <input type="text"${attr('id', field.db_fieldName)} class="sr-only" aria-hidden="true" tabindex="-1"/> `
		);
		if (showSource) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<textarea class="w-full min-h-96 p-4 font-mono text-sm bg-surface-50 dark:bg-surface-900 text-surface-900 dark:text-gray-200 border-none resize-y outline-none">`
			);
			const $$body = escape_html('');
			if ($$body) {
				$$renderer2.push(`${$$body}`);
			}
			$$renderer2.push(`</textarea>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> <style>
		:global(.ProseMirror) {
			outline: none;
		}
		:global(.ProseMirror p.is-editor-empty:first-child::before) {
			color: #adb5bd;
			content: attr(data-placeholder);
			float: left;
			height: 0;
			pointer-events: none;
		}
		:global(.ProseMirror table) {
			border-collapse: collapse;
			margin: 0;
			overflow: hidden;
			table-layout: fixed;
			width: 100%;
		}
		:global(.ProseMirror td),
		:global(.ProseMirror th) {
			border: 1px solid #ced4da;
			box-sizing: border-box;
			min-width: 1em;
			padding: 6px 8px;
			position: relative;
			vertical-align: top;
		}
		:global(.ProseMirror th) {
			background-color: #f1f3f5;
			font-weight: bold;
			text-align: left;
		}
		/* Dark mode table styles */
		:global(.dark .ProseMirror td),
		:global(.dark .ProseMirror th) {
			border-color: #3f3f46; /* surface-700 */
		}
		:global(.dark .ProseMirror th) {
			background-color: #27272a; /* surface-800 */
		}
	</style> `);
		if (error) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="border-t border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20 px-8 py-4 text-sm text-red-700 dark:text-red-300">${escape_html(error)}</div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (showSlashMenu) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div role="button" tabindex="0" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"><div class="w-full max-w-lg rounded-2xl border border-surface-300 dark:text-surface-50 bg-white dark:bg-surface-900 p-6 shadow-2xl"><h3 class="mb-5 text-xl font-semibold text-surface-900 dark:text-white">Command Menu</h3> <div class="space-y-2"><button class="flex w-full items-center gap-4 rounded-xl px-5 py-4 hover:bg-surface-100 dark:hover:bg-surface-700 transition"><iconify-icon icon="mdi:arrow-down-bold" width="22" class="text-surface-600 dark:text-surface-50"></iconify-icon> <div class="text-left"><div class="font-medium text-surface-900 dark:text-white">Hard Break</div> <div class="text-sm text-surface-500 dark:text-surface-50">Insert line break</div></div></button> `
			);
			if (field.aiEnabled) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<button class="flex w-full items-center gap-4 rounded-xl px-5 py-4 hover:bg-surface-100 dark:hover:bg-surface-700 transition"><iconify-icon icon="mdi:sparkles" width="22" class="text-purple-600"></iconify-icon> <div class="text-left"><div class="font-medium text-surface-900 dark:text-white">Ask AI</div> <div class="text-sm text-surface-500 dark:text-surface-50">Generate or rewrite with AI</div></div></button>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--></div></div></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> <input type="color" class="hidden"/></div>`);
		bind_props($$props, { value });
	});
}
export { Input as default };
//# sourceMappingURL=Input18.js.map
