/**
@file src/widgets/core/richText/extensions/TextStyle.ts
@description - RichText TipTap widget text style extension with fixed font size handling
*/

import TextStyle from '@tiptap/extension-text-style';

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		fontSize: {
			/**
			 * Set the font size
			 */
			setFontSize: (size: string | number) => ReturnType;
			/**
			 * Unset the font size
			 */
			unsetFontSize: () => ReturnType;
		};
	}
}

export default TextStyle.extend({
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
					// Convert numbers to string to ensure consistent handling
					const size = typeof fontSize === 'number' ? fontSize.toString() : fontSize;
					return chain().focus().setMark(this.name, { fontSize: size }).run();
				},
			unsetFontSize:
				() =>
				({ chain }) => {
					return chain().focus().setMark(this.name, { fontSize: null }).removeEmptyTextStyle().run();
				}
		};
	}
});
