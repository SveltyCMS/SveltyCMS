/**
@file src/widgets/core/RichText/extensions/ImageResize.ts
@description - RichText TipTap widget image extension
*/
import { Image as ImageExtension } from '@tiptap/extension-image';

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		imageResize: {
			setImageDescription: (description: string) => ReturnType;
			setImageFloat: (size: 'left' | 'right' | 'unset') => ReturnType;
			setImage: (options: { src: string; alt?: string; title?: string; id?: string; storage_image?: string }) => ReturnType;
		};
	}
}

const DESCRIPTION_STYLE =
	'text-align: center;position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0, 0, 0, .5); color: #fff; padding: 5px; font-size: 16px;';

const ImageResize = ImageExtension.extend({
	addOptions() {
		return {
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
				(side: 'left' | 'right' | 'unset') =>
				({ commands }) =>
					commands.updateAttributes(this.name, { float: side }),
			setImageDescription:
				(description: string) =>
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
				parseHTML: (element) => (element.querySelector('img') as HTMLElement).getAttribute('storage_image')
			},
			src: {
				default: null,
				parseHTML: (element) => (element.querySelector('img') as HTMLElement).getAttribute('src')
			},
			alt: {
				default: null,
				parseHTML: (element) => (element.querySelector('img') as HTMLElement).getAttribute('alt')
			},
			float: {
				default: 'unset',
				parseHTML: (element) => (element as HTMLElement).style.float
			},
			w: {
				default: '200px',
				parseHTML: (element) => (element as HTMLElement).style.width
			},
			h: {
				default: null,
				parseHTML: (element) => (element as HTMLElement).style.height
			},
			margin: {
				default: 'unset',
				parseHTML: (element) => (element as HTMLElement).style.margin
			},
			textAlign: {
				default: 'unset',
				parseHTML: (element) => (element as HTMLElement).style.textAlign
			},
			default: {
				default: false
			},
			description: {
				default: '',
				parseHTML: (element) => {
					return (element.querySelector('.description') as HTMLElement)?.innerText || '';
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
					if ((node as HTMLElement).querySelector('img')) {
						return {};
					}
					return false;
				}
			},
			{
				tag: 'img[src]',
				getAttrs: (node) => {
					if ((node as HTMLElement).closest('div[style*="float"]')) {
						return false;
					}
					return {};
				}
			}
		];
	},

	addNodeView() {
		return ({ editor, node, getPos }) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const nodeAttrs = (node as any).attrs as Record<string, unknown>;
			nodeAttrs._ = null;

			const container = document.createElement('div');
			container.style.position = 'relative';
			container.style.display = 'inline-block';
			// SECURITY: Whitelist allowed float values to prevent CSS injection
			const safeFloat = ['left', 'right', 'unset', 'none'].includes(nodeAttrs.float as string) ? (nodeAttrs.float as string) : 'unset';
			container.style.float = safeFloat;
			container.style.lineHeight = '0';

			const resizer = document.createElement('div');
			resizer.style.position = 'relative';
			// SECURITY: Validate dimensions to prevent CSS injection
			// Only allow numeric values with px/% units
			const safeWidth = String(nodeAttrs.w || '200px').match(/^\d+(%|px)$/) ? String(nodeAttrs.w) : '200px';
			const safeHeight = nodeAttrs.h && String(nodeAttrs.h).match(/^\d+(%|px)$/) ? String(nodeAttrs.h) : 'auto';
			resizer.style.width = safeWidth;
			resizer.style.height = safeHeight;
			resizer.style.display = 'inline-block';

			const img = document.createElement('img');
			img.setAttribute('src', nodeAttrs.src as string);
			img.setAttribute('alt', nodeAttrs.alt as string);
			img.style.width = '100%';
			img.style.height = '100%';
			img.style.cursor = 'pointer';

			resizer.appendChild(img);
			container.appendChild(resizer);

			if (nodeAttrs.description) {
				const desc = document.createElement('div');
				// SECURITY: textContent auto-escapes HTML (safe)
				// Never use innerHTML here - would allow XSS via image description
				desc.textContent = nodeAttrs.description as string;
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

			const onDrag = (e: MouseEvent) => {
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
					if (pos !== undefined) {
						editor.view.dispatch(
							editor.view.state.tr.setNodeMarkup(pos, undefined, {
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

function preserveAspectRatio(resizer: HTMLDivElement, nodeAttrs: Record<string, unknown>, width: string, preserveRatio = true) {
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

function knobDrag(
	e: PointerEvent,
	knob: HTMLDivElement,
	side: 'left' | 'right' | 'top' | 'bottom',
	resizer: HTMLDivElement,
	nodeAttrs: Record<string, unknown>
) {
	e.preventDefault();
	e.stopPropagation();

	// Check if shift key is pressed to preserve aspect ratio
	const shouldPreserveAspectRatio = e.shiftKey;

	knob.setPointerCapture(e.pointerId);
	knob.onpointermove = (e) => {
		if (side == 'left' || side == 'right') {
			const currentWidth = parseInt(resizer.style.width, 10);
			const dx = side === 'left' ? e.movementX * -1 : e.movementX;
			const newWidth = currentWidth + dx;
			resizer.style.width = `${newWidth}px`;
			nodeAttrs.w = `${newWidth}px`;
			preserveAspectRatio(resizer, nodeAttrs, `${newWidth}px`, shouldPreserveAspectRatio);
		} else {
			const currentHeight = parseInt(resizer.style.height, 10);
			const dy = side === 'top' ? e.movementY * -1 : e.movementY;
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

export { ImageResize as default, ImageResize };
