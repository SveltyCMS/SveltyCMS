/**
@file src/widgets/core/RichText/extensions/TextStyle.ts
@description - RichText TipTap widget text style extension with fixed font size handling

Features:
- Font Size
- Font Color
- Font Weight
- Text Alignment
*/

// TipTap v3 exports TextStyle as a named export (no default)
import { TextStyle } from '@tiptap/extension-text-style';

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		fontSize: {
			// Set the font size
			setFontSize: (size: string) => ReturnType;
			// Unset the font size
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
				(fontSize: string) =>
				({ chain }) => {
					// SECURITY: Sanitize font-size to prevent CSS injection
					// Only allow numeric values with px/em/rem/pt/% units
					const size = String(fontSize);
					const sanitized = size.match(/^\d+(\.\d+)?(px|em|rem|pt|%)$/) ? size : '16px';
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
