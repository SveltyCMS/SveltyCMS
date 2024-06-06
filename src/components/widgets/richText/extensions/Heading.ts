import { mergeAttributes } from '@tiptap/core';
import Heading from '@tiptap/extension-heading';

export default Heading.extend({
	levels: [1, 2],
	renderHTML({ node, HTMLAttributes }) {
		const level = this.options.levels.includes(node.attrs.level) ? node.attrs.level : this.options.levels[0];
		const classes: { [index: number]: string } = {
			1: 'text-2xl',
			2: 'text-xl'
		};
		return [
			`h${level}`,
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
				class: `${classes[level]}`
			}),
			0
		];
	}
}).configure({ levels: [1, 2] });
