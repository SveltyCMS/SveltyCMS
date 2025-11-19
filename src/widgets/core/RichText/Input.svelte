<!--
@file src/widgets/core/RichText/Input.svelte
@component
**RichText Widget Input Component**

Provides WYSIWYG rich text editing with Tiptap editor and configurable toolbar.
Part of the Three Pillars Architecture for widget system.

@example
<RichTextInput bind:value={richTextData} field={fieldDefinition} />
Interactive Tiptap editor with toolbar and title input

### Props
- `field: FieldType` - Widget field definition with toolbar configuration
- `value: Record<string, RichTextData> | null | undefined` - Multilingual rich text data (bindable)
- `error?: string | null` - Validation error message for display

### Features
- **Tiptap Integration**: Professional WYSIWYG editor with extensible architecture
- **Configurable Toolbar**: Field-driven toolbar options (bold, italic, etc.)
- **Multilingual Support**: Language-aware content editing and storage
- **Title Field**: Separate title input for structured content
- **Real-time Sync**: Automatic content synchronization between editor and state
- **Language Switching**: Dynamic content loading when language changes
- **Editor Lifecycle**: Proper initialization and cleanup handling
- **Empty State Detection**: Smart handling of empty editor content
- **Modular Design**: Decoupled editor configuration for maintainability
-->

<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import { onDestroy, onMount } from 'svelte';
	import type { FieldType } from './';
	import { createEditor } from './tiptap';
	import type { RichTextData } from './types';
	import { contentLanguage } from '@src/stores/store.svelte';

	let { field, value, error }: { field: FieldType; value: Record<string, RichTextData> | null | undefined; error?: string | null } = $props();

	// Determine the current language.
	const lang = $derived(field.translated ? $contentLanguage : 'default');

	// Ensure value structure exists for safe binding
	$effect(() => {
		if (!value) {
			value = {};
		}
		if (value && !value[lang]) {
			value[lang] = { title: '', content: '' };
		}
	});

	// Create a safe getter/setter for title binding
	const titleValue = $derived.by(() => {
		return {
			get value() {
				return value?.[lang]?.title || '';
			},
			set value(newTitle: string) {
				if (value && value[lang]) {
					value[lang].title = newTitle;
				}
			}
		};
	});

	// Local state for the Tiptap editor instance and its container.
	let editor: Editor | null = $state(null);
	let element: HTMLDivElement;

	// Initialize the editor when the component mounts.
	onMount(() => {
		const initialContent = value?.[lang]?.content || '';
		// Pass the element, content, AND language to the createEditor function
		editor = createEditor(element, initialContent, lang);

		// When Tiptap updates, sync its content back to the parent `value`.
		// Note: Content is sanitized on display via Sanitize component
		// This provides defense-in-depth security architecture
		editor.on('update', () => {
			const newContent = editor!.getHTML();
			value = {
				...(value || {}),
				[lang]: {
					...(value?.[lang] || { title: '' }),
					content: editor!.isEmpty ? '' : newContent
				}
			};
		});
	});

	// Cleanup the editor instance on destroy.
	onDestroy(() => {
		editor?.destroy();
	});

	// Update Tiptap's content if the language or external value changes.
	$effect(() => {
		const newContent = value?.[lang]?.content || '';
		if (editor && editor.getHTML() !== newContent) {
			editor.commands.setContent(newContent, { emitUpdate: false });
		}
	});

	// A helper function to check if a toolbar button should be visible.
	const show = (option: string) => !field.toolbar || (field.toolbar as string[])?.includes(option);
</script>

<div class="richtext-container" class:invalid={error}>
	<input type="text" class="title-input" placeholder="Title..." bind:value={titleValue.value} />

	{#if editor}
		<div class="toolbar">
			{#if show('bold')}
				<button onclick={() => editor?.chain().focus().toggleBold().run()} class:active={editor.isActive('bold')}> B </button>
			{/if}
			{#if show('italic')}
				<button onclick={() => editor?.chain().focus().toggleItalic().run()} class:active={editor.isActive('italic')}> I </button>
			{/if}
		</div>
	{/if}

	<div bind:this={element} class="editor-content"></div>

	{#if error}
		<p class="error-message" role="alert">{error}</p>
	{/if}
</div>
