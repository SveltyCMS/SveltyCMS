import ImageExtension from '@tiptap/extension-image';
declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		imageResize: {
			setImageFloat: (size: 'left' | 'right' | 'unset') => ReturnType;
			setImage: (options: { src: string; alt?: string; title?: string; id?: string; media_image?: string }) => ReturnType;
		};
	}
}

const ImageResize = ImageExtension.extend({
	addOptions() {
		return {
			...this.parent?.(),
			id: null,
			media_image: null
		};
	},
	addCommands() {
		return {
			...this.parent?.(),
			setImageFloat:
				(side: 'left' | 'right' | 'unset') =>
				({ commands }) =>
					commands.updateAttributes('image', { float: side })
		};
	},
	addAttributes() {
		return {
			id: {
				default: null
			},
			media_image: {
				default: null,
				parseHTML: (element) => (element.firstChild as HTMLElement).getAttribute('media_image')
			},
			src: {
				default: null,
				parseHTML: (element) => (element.firstChild as HTMLElement).getAttribute('src')
			},
			alt: {
				default: null,
				parseHTML: (element) => (element.firstChild as HTMLElement).getAttribute('alt')
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
			marginLeft: {
				default: 'unset',
				parseHTML: (element) => (element as HTMLElement).style.marginLeft
			},
			textAlign: {
				default: 'unset',
				parseHTML: (element) => (element as HTMLElement).style.textAlign
			},
			default: {
				default: false
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
		return [
			'div',
			{
				style: `text-align: ${HTMLAttributes.textAlign};float: ${HTMLAttributes.float};width: ${HTMLAttributes.w};height: ${HTMLAttributes.h}; margin-left: ${HTMLAttributes.marginLeft}`
			},
			[
				'img',
				{
					media_image: HTMLAttributes.media_image,
					src: HTMLAttributes.id || HTMLAttributes.src,
					style: 'width: 100%; height: 100%; cursor:pointer'
				}
			]
		];
	},
	parseHTML() {
		return [
			{
				tag: 'div',

				getAttrs: (node) => {
					if ((node.firstChild as HTMLElement).tagName == 'IMG') return null;
					return false;
				}
			}
		];
	},
	addNodeView() {
		return ({ editor, HTMLAttributes, node }) => {
			const { src, alt } = HTMLAttributes;
			const nodeAttrs = node.attrs as any;
			nodeAttrs._ = null;

			const container = document.createElement('div');
			const resizer = document.createElement('div');
			const img = document.createElement('img');
			container.style.textAlign = nodeAttrs.textAlign;

			Object.assign(resizer.style, {
				overflow: 'hidden',
				resize: 'both',
				display: 'inline-block',
				position: 'relative',
				width: nodeAttrs.w,
				height: nodeAttrs.h,
				marginLeft: nodeAttrs.marginLeft,
				float: nodeAttrs.float
			});

			resizer.appendChild(img);

			img.src = src;
			img.alt = alt;
			img.style.width = '100%';
			img.style.height = '100%';
			img.style.cursor = 'pointer';

			const resizeObserver = new ResizeObserver((entries) => {
				nodeAttrs.w = resizer.offsetWidth + 'px';
				nodeAttrs.h = resizer.offsetHeight + 'px';
			});

			resizeObserver.observe(resizer);

			container.appendChild(resizer);

			resizer.ondrag = (e) => {
				resizer.style.opacity = '0';
				nodeAttrs.marginLeft = resizer.style.marginLeft =
					Math.max(
						((e.clientX - editor.$doc.element.getBoundingClientRect().left - resizer.offsetWidth / 2) / editor.$doc.element.offsetWidth) * 100,
						0
					) + '%';
			};
			resizer.ondragend = (e) => {
				resizer.style.opacity = '1';
			};

			nodeAttrs.default = false;
			return {
				dom: container
			};
		};
	}
});

export { ImageResize, ImageResize as default };
