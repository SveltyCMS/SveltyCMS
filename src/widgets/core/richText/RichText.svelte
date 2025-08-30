<!--
@file src/widgets/core/richText/RichText.svelte
@component
**RichText TipTap widget component**

@example
<RichText label="RichText" db_fieldName="richText" required={true} />

### Props
- `field`: FieldType
- `value`: any

### Features
- Translatable
-->

<script lang="ts">
	import { publicEnv } from '@src/stores/globalSettings';
	import type { MediaImage } from '@utils/media/mediaModels';
	import { debounce, getFieldName, getTextDirection, meta_data } from '@utils/utils';
	import type { ComponentProps } from 'svelte';
	import { onDestroy, onMount, tick } from 'svelte';
	import type { FieldType } from '.';
	// Stores
	import { collectionValue, mode } from '@root/src/stores/collectionStore.svelte';
	import { isMobile } from '@stores/screenSizeStore.svelte';
	import { contentLanguage, validationStore } from '@stores/store.svelte';
	// Components
	import FileInput from '@components/system/inputs/FileInput.svelte';
	import ColorSelector from './components/ColorSelector.svelte';
	import DropDown from './components/DropDown.svelte';
	import ImageDescription from './components/ImageDescription.svelte';
	import VideoDialog from './components/VideoDialog.svelte';
	// TipTap
	import { Editor, Extension } from '@tiptap/core';
	import { CharacterCount } from '@tiptap/extension-character-count';
	import { Color } from '@tiptap/extension-color';
	import { FontFamily } from '@tiptap/extension-font-family';
	import { Link } from '@tiptap/extension-link';
	import { Placeholder } from '@tiptap/extension-placeholder';
	import { Table } from '@tiptap/extension-table';
	import { TableCell } from '@tiptap/extension-table-cell';
	import { TableHeader } from '@tiptap/extension-table-header';
	import { TableRow } from '@tiptap/extension-table-row';
	import { TextAlign } from '@tiptap/extension-text-align';
	import { Underline } from '@tiptap/extension-underline';
	import { Youtube } from '@tiptap/extension-youtube';
	import { StarterKit } from '@tiptap/starter-kit';
	// Custom Extensions
	import ImageResize from './extensions/ImageResize'; // IMPORTANT: You need this custom extension. See implementation below.
	import TextStyle from './extensions/TextStyle'; // IMPORTANT: You need this custom extension for font size. See implementation below.

	// Props
	let showMobileMenu = $state(false);
	let element = $state<HTMLElement | null>(null);
	let editor = $state<Editor | null>(null);
	let showImageDialog = $state(false);
	let showVideoDialog = $state(false);
	let images = $state<Record<string, File>>({});
	let active_dropDown = $state('');
	let validationError = $state<string | null>(null);

	interface Props {
		field: FieldType;
		value?: any;
		WidgetData?: any;
	}

	let {
		field,
		value = collectionValue.value[getFieldName(field)] || { content: {}, header: {} },
		WidgetData = $bindable(async () => ({ images, data: _data }))
	}: Props = $props();

	let _data = $state(mode.value === 'create' ? { content: {}, header: {} } : value);

	// Language handling
	let _defaultLanguage = $state('');
	let _language = $derived(field?.translated ? $contentLanguage : _defaultLanguage);

	// Load default language
	$effect(() => {
		if (!field?.translated) {
			_defaultLanguage = publicEnv.DEFAULT_CONTENT_LANGUAGE;
		}
	});

	// Update editor content when language changes
	$effect(() => {
		if (editor && _language) {
			const newContent = _data.content[_language] || value?.content?.[_language] || '';
			// Only update if content is different to prevent losing cursor position
			if (editor.getHTML() !== newContent) {
				editor.commands.setContent(newContent, false);
			}
			editor.setOptions({
				editorProps: {
					attributes: {
						dir: getTextDirection(_language)
					}
				}
			});
		}
	});

	const deb = debounce(500);

	// Validation function
	function validateContent() {
		const fieldId = getFieldName(field);
		if (field?.required && (!editor || editor.isEmpty)) {
			validationError = 'Content is required';
			validationStore.setError(fieldId, validationError);
			return false;
		}
		validationError = null;
		validationStore.clearError(fieldId);
		return true;
	}

	onMount(() => {
		if (!element) return;

		editor = new Editor({
			element: element,
			extensions: [
				StarterKit,
				TextStyle, // Custom extension for font-size
				FontFamily,
				Color,
				ImageResize, // Custom Image extension
				Underline,
				Placeholder.configure({
					placeholder: ({ node }) => {
						if (node.type.name === 'heading') return 'Write a heading…';
						return 'Start writing your awesome content…';
					},
					includeChildren: true,
					emptyEditorClass: 'is-editor-empty'
				}),
				Link.configure({
					openOnClick: false
				}),
				Table.configure({
					resizable: true
				}),
				TableRow,
				TableHeader,
				TableCell,
				TextAlign.configure({
					types: ['heading', 'paragraph', 'image']
				}),
				Youtube.configure({
					modestBranding: true,
					HTMLAttributes: {
						class: 'w-full aspect-video'
					}
				}),
				CharacterCount,
				Extension.create({
					name: 'Tab',
					addKeyboardShortcuts() {
						return {
							Tab: ({ editor: e }) => {
								return e.commands.insertContent('\t');
							}
						};
					}
				})
			],
			content: _data.content[_language] || value?.content?.[_language] || '',
			editorProps: {
				attributes: {
					dir: getTextDirection(_language)
				}
			},
			onUpdate: ({ editor }) => {
				active_dropDown = ''; // force re-render for active states
				let content = editor.getHTML();
				_data.content[_language] = editor.isEmpty ? '' : content;
				deb(validateContent);
			},
			onTransaction: ({ transaction }) => {
				handleImageDeletes(transaction);
			}
		});

		tick().then(() => {
			editor?.commands.focus('start');
		});
	});

	function handleImageDeletes(transaction: any) {
		if (!transaction.docChanged) return;

		const getImageIds = (fragment: any): string[] => {
			let ids: string[] = [];
			fragment.forEach((node: any) => {
				if (node.type.name === 'image' && node.attrs.id) {
					ids.push(node.attrs.id);
				}
				if (node.content) {
					ids = ids.concat(getImageIds(node.content));
				}
			});
			return ids;
		};

		const oldIds = new Set(getImageIds(transaction.before.content));
		const newIds = new Set(getImageIds(transaction.doc.content));
		const removedIds = [...oldIds].filter((id) => !newIds.has(id));

		if (removedIds.length > 0) {
			removedIds.forEach((id) => {
				if (images[id]) {
					delete images[id];
				}
			});
			meta_data.add('media_images_remove', removedIds);
		}
	}

	onDestroy(() => {
		editor?.destroy();
	});

	// DropDown Definitions
	let textTypes: ComponentProps<typeof DropDown>['items'] = $derived.by(() => {
		if (!editor) return [];
		return [
			{
				name: 'Paragraph',
				icon: 'bi:paragraph',
				active: () => editor.isActive('paragraph'),
				onClick: () => editor.chain().focus().setParagraph().run()
			},
			{
				name: 'Heading 1',
				icon: 'bi:type-h1',
				active: () => editor.isActive('heading', { level: 1 }),
				onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run()
			},
			{
				name: 'Heading 2',
				icon: 'bi:type-h2',
				active: () => editor.isActive('heading', { level: 2 }),
				onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run()
			},
			{
				name: 'Heading 3',
				icon: 'bi:type-h3',
				active: () => editor.isActive('heading', { level: 3 }),
				onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run()
			},
			{
				name: 'Heading 4',
				icon: 'bi:type-h4',
				active: () => editor.isActive('heading', { level: 4 }),
				onClick: () => editor.chain().focus().toggleHeading({ level: 4 }).run()
			}
		];
	});

	let fonts: ComponentProps<typeof DropDown>['items'] = $derived.by(() => {
		if (!editor) return [];
		return [
			{
				name: 'Arial',
				active: () => editor.isActive('textStyle', { fontFamily: 'Arial' }),
				onClick: () => editor.chain().focus().setFontFamily('Arial').run()
			},
			{
				name: 'Verdana',
				active: () => editor.isActive('textStyle', { fontFamily: 'Verdana' }),
				onClick: () => editor.chain().focus().setFontFamily('Verdana').run()
			},
			{
				name: 'Tahoma',
				active: () => editor.isActive('textStyle', { fontFamily: 'Tahoma' }),
				onClick: () => editor.chain().focus().setFontFamily('Tahoma').run()
			}
		];
	});

	let alignText: ComponentProps<typeof DropDown>['items'] = $derived.by(() => {
		if (!editor) return [];
		return [
			{
				name: 'left',
				icon: 'fa6-solid:align-left',
				active: () => editor.isActive({ textAlign: 'left' }),
				onClick: () => editor.chain().focus().setTextAlign('left').run()
			},
			{
				name: 'right',
				icon: 'fa6-solid:align-right',
				active: () => editor.isActive({ textAlign: 'right' }),
				onClick: () => editor.chain().focus().setTextAlign('right').run()
			},
			{
				name: 'center',
				icon: 'fa6-solid:align-center',
				active: () => editor.isActive({ textAlign: 'center' }),
				onClick: () => editor.chain().focus().setTextAlign('center').run()
			},
			{
				name: 'justify',
				icon: 'fa6-solid:align-justify',
				active: () => editor.isActive({ textAlign: 'justify' }),
				onClick: () => editor.chain().focus().setTextAlign('justify').run()
			}
		];
	});

	let inserts: ComponentProps<typeof DropDown>['items'] = $derived.by(() => {
		if (!editor) return [];
		return [
			{ name: 'image', icon: 'fa6-solid:image', onClick: () => (showImageDialog = true), active: () => editor.isActive('image') },
			{ name: 'video', icon: 'fa6-solid:video', onClick: () => (showVideoDialog = true), active: () => editor.isActive('youtube') },
			{
				name: 'table',
				icon: 'bi:table',
				onClick: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
				active: () => editor.isActive('table')
			}
		];
	});

	let floats: ComponentProps<typeof DropDown>['items'] = $derived.by(() => {
		if (!editor) return [];
		return [
			{
				name: 'wrap left',
				icon: 'teenyicons:align-left-solid',
				onClick: () => editor.chain().focus().setImageFloat('left').run(),
				active: () => editor.isActive('image', { float: 'left' })
			},
			{
				name: 'wrap right',
				icon: 'teenyicons:align-right-solid',
				onClick: () => editor.chain().focus().setImageFloat('right').run(),
				active: () => editor.isActive('image', { float: 'right' })
			},
			{
				name: 'unwrap',
				icon: 'mdi:filter-remove',
				onClick: () => editor.chain().focus().setImageFloat('unset').run(),
				active: () => !editor.getAttributes('image').float || editor.getAttributes('image').float === 'unset'
			}
		];
	});

	// Font Size
	let fontSize = $state(16);
	$effect(() => {
		if (editor) {
			const sizeAttr = editor.getAttributes('textStyle').fontSize;
			fontSize = sizeAttr ? parseInt(sizeAttr.replace('px', ''), 10) : 16;
		}
	});

	function show(button: string) {
		if (!editor) return false;
		if (editor.isActive('image')) {
			return ['float', 'align', 'description'].includes(button);
		}
		if (['description', 'float'].includes(button)) {
			return false;
		}
		return true;
	}

	function handleFontSize(change: number) {
		const newSize = Math.max(8, Math.min(72, fontSize + change));
		editor?.chain().focus().setFontSize(`${newSize}px`).run();
	}

	function setFontSizeDirect(value: number) {
		if (Number.isNaN(value)) return;
		const clamped = Math.max(8, Math.min(72, value));
		fontSize = clamped;
		editor?.chain().focus().setFontSize(`${clamped}px`).run();
	}

	function setLink() {
		if (!editor) return;
		const previousUrl = editor.getAttributes('link').href;
		const url = window.prompt('URL', previousUrl);

		if (url === null) return; // Cancelled
		if (url === '') {
			editor.chain().focus().extendMarkRange('link').unsetLink().run();
			return;
		}

		const finalUrl = /^(https?:\/\/)/i.test(url) ? url : `https://${url}`;
		editor.chain().focus().extendMarkRange('link').setLink({ href: finalUrl }).run();
	}

	function clearFormatting() {
		if (!editor) return;
		editor.chain().focus().unsetAllMarks().clearNodes().run();
	}

	let isUploading = $state(false);
	function handleFileChange(value: File | MediaImage) {
		if (!editor) return;
		isUploading = true;

		if (value instanceof File) {
			const url = URL.createObjectURL(value);
			const image_id = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
			images[image_id] = value;
			editor.chain().focus().setImage({ src: url, id: image_id }).run();
		} else {
			const url = value.url;
			editor.chain().focus().setImage({ src: url, storage_image: value._id }).run();
		}

		isUploading = false;
	}
</script>

<div class="input-container relative mb-4" role="form" aria-label="Rich text editor form">
	<input
		type="text"
		bind:value={_data.header[_language]}
		placeholder="Title"
		class="input mt-2 !w-full"
		class:error={!!validationError}
		aria-invalid={!!validationError}
		aria-describedby={validationError ? `${getFieldName(field)}-error` : undefined}
		aria-label="Content title"
	/>

	<div class="m-auto flex max-h-[500px] w-full flex-col items-center gap-2 overflow-auto">
		<!-- Toolbar -->
		{#if editor}
			<div
				class="sticky top-0 z-10 my-1 flex w-full flex-wrap items-center justify-start gap-1 rounded border border-surface-400/40 bg-surface-600/40 p-1 backdrop-blur-sm dark:border-surface-300/20 dark:bg-surface-800/40"
				role="toolbar"
				aria-label="Rich text editor toolbar"
			>
				{#if isMobile.value}
					<button
						type="button"
						onclick={() => (showMobileMenu = !showMobileMenu)}
						class="btn-sm"
						aria-label="Toggle toolbar menu"
						aria-expanded={showMobileMenu}
					>
						<iconify-icon icon="mdi:menu" width="22"></iconify-icon>
					</button>
				{/if}
				<div class="flex flex-wrap gap-1" class:hidden={isMobile.value && !showMobileMenu}>
					<DropDown {show} items={textTypes} label="Text style" bind:active={active_dropDown} />
					<DropDown show={show('font')} items={fonts} icon="gravity-ui:text" label="Font family" bind:active={active_dropDown} />
					<ColorSelector
						show={show('color')}
						color={editor?.getAttributes('textStyle').color || '#000000'}
						onChange={(color) => editor?.chain().focus().setColor(color).run()}
						bind:active={active_dropDown}
					/>
					<div class:hidden={!show('fontSize')} class="flex items-center" role="group" aria-label="Font size controls">
						<button type="button" onclick={() => handleFontSize(-1)} class="btn-sm" aria-label="Decrease font size" title="Decrease font size">
							<iconify-icon icon="bi:dash-lg" width="20"></iconify-icon>
						</button>
						<input
							id="rt-font-size"
							type="number"
							min="8"
							max="72"
							step="1"
							class="w-14 rounded border border-transparent bg-white/90 px-1 text-center text-sm text-black outline-none focus:border-primary-400 dark:bg-surface-600 dark:text-white"
							bind:value={fontSize}
							aria-label="Font size"
							aria-valuenow={fontSize}
							aria-valuemin="8"
							aria-valuemax="72"
							onchange={(e) => setFontSizeDirect(parseInt(e.currentTarget.value, 10))}
						/>
						<button
							type="button"
							onclick={() => handleFontSize(1)}
							class="btn-sm"
							aria-label="Increase font size"
							title="Increase font size"
							aria-controls="rt-font-size"
						>
							<iconify-icon icon="bi:plus-lg" width="22"></iconify-icon>
						</button>
					</div>
					<span
						role="separator"
						aria-orientation="vertical"
						class="mx-0.5 h-6 w-px self-center bg-surface-500/40 dark:bg-surface-300/30"
						aria-hidden="true"
					></span>
					<div class="flex items-center divide-x rounded border border-surface-500 px-1" role="group" aria-label="Inline formatting">
						<button
							class:hidden={!show('bold')}
							type="button"
							onclick={() => editor.chain().focus().toggleBold().run()}
							class:active={editor.isActive('bold')}
							aria-label="Bold"
							aria-pressed={editor.isActive('bold')}
							title="Bold (Ctrl+B)"
							aria-keyshortcuts="Control+B"
						>
							<iconify-icon icon="bi:type-bold" width="22"></iconify-icon>
						</button>
						<button
							class:hidden={!show('italic')}
							type="button"
							onclick={() => editor.chain().focus().toggleItalic().run()}
							class:active={editor.isActive('italic')}
							aria-label="Italic"
							aria-pressed={editor.isActive('italic')}
							title="Italic (Ctrl+I)"
							aria-keyshortcuts="Control+I"
						>
							<iconify-icon icon="bi:type-italic" width="22"></iconify-icon>
						</button>
						<button
							class:hidden={!show('underline')}
							type="button"
							onclick={() => editor.chain().focus().toggleUnderline().run()}
							class:active={editor.isActive('underline')}
							aria-label="Underline"
							aria-pressed={editor.isActive('underline')}
							title="Underline (Ctrl+U)"
							aria-keyshortcuts="Control+U"
						>
							<iconify-icon icon="bi:type-underline" width="22"></iconify-icon>
						</button>
						<button
							class:hidden={!show('strike')}
							type="button"
							onclick={() => editor.chain().focus().toggleStrike().run()}
							class:active={editor.isActive('strike')}
							aria-label="Strikethrough"
							aria-pressed={editor.isActive('strike')}
							title="Strikethrough (Ctrl+Shift+S)"
							aria-keyshortcuts="Control+Shift+S"
						>
							<iconify-icon icon="bi:type-strikethrough" width="22"></iconify-icon>
						</button>
						<button
							class:hidden={!show('link')}
							type="button"
							onclick={() => (editor.isActive('link') ? editor.chain().focus().unsetLink().run() : setLink())}
							class:active={editor.isActive('link')}
							aria-label={editor.isActive('link') ? 'Remove link' : 'Insert link'}
							aria-pressed={editor.isActive('link')}
							title={editor.isActive('link') ? 'Remove link (Ctrl+K)' : 'Link (Ctrl+K)'}
							aria-keyshortcuts="Control+K"
						>
							<iconify-icon icon="bi:link-45deg" width="20"></iconify-icon>
						</button>
						<button type="button" onclick={clearFormatting} aria-label="Clear formatting" title="Clear formatting">
							<iconify-icon icon="mdi:format-clear" width="20"></iconify-icon>
						</button>
					</div>
					<span
						role="separator"
						aria-orientation="vertical"
						class="mx-0.5 h-6 w-px self-center bg-surface-500/40 dark:bg-surface-300/30"
						aria-hidden="true"
					></span>
					<DropDown show={show('align')} items={alignText} icon="fa6-solid:align-left" label="Alignment" bind:active={active_dropDown} />
					<DropDown show={show('insert')} items={inserts} icon="typcn:plus" label="Insert elements" bind:active={active_dropDown} />
					<DropDown show={show('float')} items={floats} icon="grommet-icons:text-wrap" label="Image wrap" bind:active={active_dropDown} />
					<ImageDescription
						show={show('description')}
						value={editor?.getAttributes('image')?.description}
						onSubmit={(description) => editor?.chain().focus().setImageDescription(description).run()}
						bind:active={active_dropDown}
					/>
					<div class="divide-x" role="group" aria-label="History">
						<button
							type="button"
							onclick={() => editor.chain().focus().undo().run()}
							class="btn"
							disabled={!editor.can().undo()}
							aria-label="Undo"
							title="Undo (Ctrl+Z)"
						>
							<iconify-icon icon="mdi:undo" width="22"></iconify-icon>
						</button>
						<button
							type="button"
							onclick={() => editor.chain().focus().redo().run()}
							class="btn"
							disabled={!editor.can().redo()}
							aria-label="Redo"
							title="Redo (Ctrl+Shift+Z)"
						>
							<iconify-icon icon="mdi:redo" width="22"></iconify-icon>
						</button>
					</div>
					<div
						class="ml-auto flex items-center justify-end px-2 text-xs text-gray-500 dark:text-gray-400"
						aria-live="polite"
						aria-atomic="true"
						id="editor-stats"
					>
						{editor.storage.characterCount?.characters() || 0} characters | {editor.storage.characterCount?.words() || 0} words
					</div>
				</div>
			</div>
		{/if}
		<FileInput {showImageDialog} on:change={(e) => handleFileChange(e.detail)} className="fixed left-1/2 top-0 z-10 -translate-x-1/2 bg-white" />
		<VideoDialog bind:show={showVideoDialog} {editor} />
		<div
			bind:this={element}
			role="textbox"
			tabindex="0"
			class="tiptap-editor min-h-[calc(100vh-80px)] w-full flex-grow cursor-text overflow-auto rounded border border-surface-300 bg-surface-100 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-surface-400 dark:bg-surface-700 dark:text-white"
			class:error={!!validationError}
			aria-label="Rich text editor"
			aria-multiline="true"
			aria-required={!!field?.required}
		></div>
	</div>

	{#if validationError}
		<p id={`${getFieldName(field)}-error`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">
			{validationError}
		</p>
	{/if}
</div>

<style lang="postcss">
	button.active {
		color: rgb(0, 255, 123);
	}

	:global(.tiptap) {
		outline: none;
	}

	/* Editor wrapper styling */
	.tiptap-editor {
		background-image:
			linear-gradient(var(--tw-color-surface-200) 1px, transparent 1px), linear-gradient(90deg, var(--tw-color-surface-200) 1px, transparent 1px);
		background-size:
			22px 22px,
			22px 22px;
		background-position: -1px -1px;
	}

	/* Placeholder */
	:global(.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		float: left;
		color: theme('colors.gray.400');
		pointer-events: none;
		height: 0;
	}

	:global(.ProseMirror-selectednode img) {
		outline: 2px solid theme('colors.primary.500');
	}

	:global(.dark .ProseMirror),
	:global(.dark .ProseMirror *) {
		color: white !important;
	}

	.input-container {
		min-height: 2.5rem;
	}

	.error {
		border-color: rgb(239 68 68);
	}
</style>
