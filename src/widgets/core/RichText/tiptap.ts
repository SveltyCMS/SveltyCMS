/**
 * @file src/widgets/core/RichText/tiptap.ts
 * @description Tiptap Editor Configuration.
 *
 * Centralizes the creation and configuration of the Tiptap editor instance,
 * decoupling it from the Svelte component. This file contains all extensions
 * and settings for the rich text editor.
 *
 * @features
 * - **Decoupled Logic**: Separates complex Tiptap setup from Svelte components.
 * - **Fully Configured**: Includes all required extensions like Tables, ImageResize, and Placeholder.
 * - **Language Aware**: Accepts a language code to set the correct text direction (LTR/RTL).
 */
import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { Youtube } from '@tiptap/extension-youtube';
import { CharacterCount } from '@tiptap/extension-character-count';
import { Color } from '@tiptap/extension-color';
import { FontFamily } from '@tiptap/extension-font-family';

// Import your custom extensions
import ImageResize from './extensions/ImageResize';
import TextStyle from './extensions/TextStyle';

// Import helper for text direction
import { getTextDirection } from '@utils/utils';

/**
 * Creates a pre-configured Tiptap editor instance.
 * @param element The HTML element to bind the editor to.
 * @param content The initial HTML content for the editor.
 * @param language The current language code (e.g., 'en', 'ar') for text direction.
 * @param options Additional options for the editor.
 */
export function createEditor(element: HTMLElement, content: string, language: string, _options: { aiEnabled?: boolean } = {}) {
	// All extensions from your original component are now configured here.
	return new Editor({
		element,
		extensions: [
			StarterKit.configure({
				link: false,
				underline: false
			}),
			TextStyle, // Custom extension for font-size
			FontFamily,
			Color,
			ImageResize, // Custom Image extension
			Underline,
			Link.configure({
				openOnClick: false
			}),
			Placeholder.configure({
				placeholder: ({ node }) => {
					if (node.type.name === 'heading') return 'Write a heading…';
					return 'Start writing your awesome content…';
				},
				includeChildren: true,
				emptyEditorClass: 'is-editor-empty'
			}),
			Table.configure({
				resizable: true
			}),
			TableRow,
			TableHeader,
			TableCell,
			TextAlign.configure({
				types: ['heading', 'paragraph', 'image'],
				defaultAlignment: 'left'
			}),
			Youtube.configure({
				modestBranding: true,
				HTMLAttributes: {
					class: 'w-full aspect-video'
				}
			}),
			CharacterCount,
			// Custom extension for the Tab key
			Extension.create({
				name: 'Tab',
				addKeyboardShortcuts() {
					return {
						Tab: ({ editor: e }) => e.commands.insertContent('\t')
					};
				}
			})
		],
		content,
		editorProps: {
			attributes: {
				class: 'prose dark:prose-invert max-w-none focus:outline-none',
				dir: getTextDirection(language) // Set text direction dynamically
			}
		}
	});
}
