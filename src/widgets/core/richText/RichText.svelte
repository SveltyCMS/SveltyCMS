<!-- 
@file src/widgets/core/richText/RichText.svelte
@component
**RichText TipTap widget component**

This component has been updated for Tiptap v3 and includes several UX enhancements.

### Props
- `field`: FieldType
- `value`: any
- `WidgetData`: bindable property to pass data to the parent

### Features
- Translatable
- Enhanced image resizing with aspect ratio lock (Shift key)
- Improved link editing workflow with a prompt
- Clearer visual feedback for active buttons and uploads
- Better mobile experience with a collapsible toolbar
- Robust validation and image deletion logic
-->

<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { onMount, onDestroy, tick } from 'svelte';
	import { v4 as uuidv4 } from 'uuid';
	import { meta_data, debounce, getFieldName } from '@utils/utils';
	import { getTextDirection } from '@utils/utils';
	import type { MediaImage } from '@utils/media/mediaModels';
	import type { ComponentProps } from 'svelte';
	import type { FieldType } from '.';

	// Stores
	import { isMobile } from '@stores/screenSizeStore.svelte';
	import { contentLanguage, validationStore } from '@stores/store.svelte';
	import { mode, collectionValue } from '@root/src/stores/collectionStore.svelte';

	// Components
	import DropDown from './components/DropDown.svelte';
	import ColorSelector from './components/ColorSelector.svelte';
	import ImageDescription from './components/ImageDescription.svelte';
	import FileInput from '@components/system/inputs/FileInput.svelte';
	import VideoDialog from './components/VideoDialog.svelte';

	// TipTap v3 Imports
	import { Editor, Extension } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Link from '@tiptap/extension-link';
	import Youtube from '@tiptap/extension-youtube';
	import CharacterCount from '@tiptap/extension-character-count';
	import Table from '@tiptap/extension-table';
	import TableRow from '@tiptap/extension-table-row';
	import TableCell from '@tiptap/extension-table-cell';
	import TableHeader from '@tiptap/extension-table-header';
	import TextAlign from '@tiptap/extension-text-align';
	import FontFamily from '@tiptap/extension-font-family';
	import Color from '@tiptap/extension-color';
	import ImageResize from './extensions/ImageResize'; // Updated for v3
	import TextStyle from './extensions/TextStyle'; // Custom extension

	// Props
	let {
		field,
		value = collectionValue.value[getFieldName(field)] || { content: {}, header: {} },
		WidgetData = $bindable(async () => ({ images, data: _data }))
	}: {
		field: FieldType;
		value?: any;
		WidgetData?: any;
	} = $props();

	// State
	let element: HTMLElement | null = $state(null);
	let editor: Editor | null = $state(null);
	let showImageDialog = $state(false);
	let showVideoDialog = $state(false);
	let images: Record<string, File> = $state({});
	let active_dropDown = $state('');
	let validationError = $state<string | null>(null);
	let showMobileMenu = $state(false);
	let isUploading = $state(false);
	let _data = $state(mode.value === 'create' ? { content: {}, header: {} } : { ...value });

	// Language handling
	const _language = $derived(field?.translated ? $contentLanguage : publicEnv.DEFAULT_CONTENT_LANGUAGE);

	// Update editor content when language or initial value changes
	$effect(() => {
		if (editor && _language) {
			const newContent = _data.content?.[_language] || '';
			if (editor.getHTML() !== newContent) {
				editor.commands.setContent(newContent, false);
			}
		}
	});

	const debouncedUpdate = debounce(500);

	// Validation
	function validateContent() {
		const fieldId = getFieldName(field);
		const content = _data.content?.[_language] || '';
		if (field?.required && (!content || content === '<p></p>')) {
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
				StarterKit.configure({
					// Disable default hard break to use Shift+Enter for soft breaks
					hardBreak: false
				}),
				Link.configure({
					openOnClick: false, // Open links in a new tab, but don't follow them in the editor
					autolink: true
				}),
				TextStyle,
				FontFamily,
				Color,
				Youtube.configure({
					nocookie: true
				}),
				ImageResize, // The v3 compatible extension
				CharacterCount,
				Table.configure({
					resizable: true
				}),
				TableRow,
				TableCell,
				TableHeader,
				TextAlign.configure({
					types: ['heading', 'paragraph', 'image']
				}),
				Extension.create({
					name: 'TabHandler',
					addKeyboardShortcuts() {
						return {
							Tab: () => this.editor.commands.insertContent('\t')
						};
					}
				})
			],
			content: _data.content?.[_language] || '',
			editorProps: {
				attributes: {
					class: 'prose dark:prose-invert prose-sm sm:prose-base lg:prose-lg xl:prose-2xl m-5 focus:outline-none',
					dir: getTextDirection(_language)
				}
			},
			onUpdate: ({ editor: currentEditor }) => {
				active_dropDown = ''; // Force reactivity for active states
				debouncedUpdate(() => {
					let html = currentEditor.getHTML();
					_data.content[_language] = html === '<p></p>' ? '' : html;
					validateContent();
				});
			},
			onTransaction: ({ transaction }) => {
				handleImageDeletes(transaction);
			}
		});

		tick().then(() => {
			editor?.commands.focus('start');
			validateContent(); // Initial validation check
		});
	});

	function handleImageDeletes(transaction: any) {
		if (!transaction.docChanged) return;

		const getMediaIds = (doc: any): Set<string> => {
			const ids = new Set<string>();
			doc.descendants((node: any) => {
				if (node.type.name === 'image' && node.attrs['data-media-id']) {
					ids.add(node.attrs['data-media-id']);
				}
			});
			return ids;
		};

		const previousIds = getMediaIds(transaction.before);
		const currentIds = getMediaIds(transaction.doc);
		const deletedIds = [...previousIds].filter((id) => !currentIds.has(id));

		if (deletedIds.length > 0) {
			deletedIds.forEach((id) => {
				if (images[id]) {
					delete images[id];
				}
			});
			meta_data.add('media_images_remove', deletedIds);
		}
	}

	onDestroy(() => {
		editor?.destroy();
	});

	// --- Toolbar Items ---

	const textTypes: ComponentProps<typeof DropDown>['items'] = $derived.by(() => {
		if (!editor) return [];
		return [
			{ name: 'Paragraph', icon: 'bi:paragraph', active: () => editor.isActive('paragraph'), onClick: () => editor.chain().focus().setParagraph().run() },
			{ name: 'Heading 1', icon: 'bi:type-h1', active: () => editor.isActive('heading', { level: 1 }), onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
			{ name: 'Heading 2', icon: 'bi:type-h2', active: () => editor.isActive('heading', { level: 2 }), onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
			{ name: 'Heading 3', icon: 'bi:type-h3', active: () => editor.isActive('heading', { level: 3 }), onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
			{ name: 'Heading 4', icon: 'bi:type-h4', active: () => editor.isActive('heading', { level: 4 }), onClick: () => editor.chain().focus().toggleHeading({ level: 4 }).run() }
		];
	});

	const fonts: ComponentProps<typeof DropDown>['items'] = $derived.by(() => {
		if (!editor) return [];
		const fontList = ['Arial', 'Verdana', 'Tahoma', 'Times New Roman', 'Georgia', 'Garamond'];
		return fontList.map((font) => ({
			name: font,
			active: () => editor.isActive('textStyle', { fontFamily: font }),
			onClick: () => editor.chain().focus().setFontFamily(font).run()
		}));
	});

	const alignText: ComponentProps<typeof DropDown>['items'] = $derived.by(() => {
		if (!editor) return [];
		return [
			{ name: 'Left', icon: 'fa6-solid:align-left', active: () => editor.isActive({ textAlign: 'left' }), onClick: () => editor.chain().focus().setTextAlign('left').run() },
			{ name: 'Center', icon: 'fa6-solid:align-center', active: () => editor.isActive({ textAlign: 'center' }), onClick: () => editor.chain().focus().setTextAlign('center').run() },
			{ name: 'Right', icon: 'fa6-solid:align-right', active: () => editor.isActive({ textAlign: 'right' }), onClick: () => editor.chain().focus().setTextAlign('right').run() },
			{ name: 'Justify', icon: 'fa6-solid:align-justify', active: () => editor.isActive({ textAlign: 'justify' }), onClick: () => editor.chain().focus().setTextAlign('justify').run() }
		];
	});

	const inserts: ComponentProps<typeof DropDown>['items'] = $derived.by(() => {
		if (!editor) return [];
		return [
			{ name: 'Image', icon: 'fa6-solid:image', onClick: () => (showImageDialog = true), active: () => editor.isActive('image') },
			{ name: 'Video', icon: 'fa6-solid:video', onClick: () => (showVideoDialog = true), active: () => editor.isActive('youtube') },
			{ name: 'Table', icon: 'bi:table', onClick: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), active: () => editor.isActive('table') }
		];
	});

	const floats: ComponentProps<typeof DropDown>['items'] = $derived.by(() => {
		if (!editor) return [];
		return [
			{ name: 'Wrap Left', icon: 'teenyicons:align-left-solid', onClick: () => editor.chain().focus().setImageFloat('left').run(), active: () => editor.isActive('image', { float: 'left' }) },
			{ name: 'Wrap Right', icon: 'teenyicons:align-right-solid', onClick: () => editor.chain().focus().setImageFloat('right').run(), active: () => editor.isActive('image', { float: 'right' }) },
			{ name: 'Unwrap', icon: 'mdi:filter-remove', onClick: () => editor.chain().focus().setImageFloat('unset').run(), active: () => editor.isActive('image', { float: 'unset' }) }
		];
	});

	// --- Toolbar Logic ---

	let fontSize = $state('16');
	$effect(() => {
		if (!editor || !element) return;
		const currentSize = editor.getAttributes('textStyle').fontSize;
		if (currentSize) {
			fontSize = currentSize;
		} else {
			// Fallback to computed style if no explicit size is set
			const selection = window.getSelection();
			if (selection?.focusNode?.parentElement) {
				fontSize = window.getComputedStyle(selection.focusNode.parentElement).fontSize.replace('px', '');
			}
		}
	});

	function show(button: string) {
		if (!editor) return false;
		const isImageActive = editor.isActive('image');
		if (['float', 'align', 'description'].includes(button)) return isImageActive;
		if (isImageActive) return false;
		return true;
	}

	function handleFontSizeChange(e: Event) {
		const target = e.target as HTMLInputElement;
		fontSize = target.value;
		editor?.chain().focus().setFontSize(fontSize).run();
	}

	function setLink() {
		if (!editor) return;
		const previousUrl = editor.getAttributes('link').href;
		const url = window.prompt('URL', previousUrl);

		if (url === null) return; // User cancelled
		if (url === '') {
			editor.chain().focus().extendMarkRange('link').unsetLink().run();
			return;
		}
		editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
	}

	async function handleFileChange(value: File | MediaImage) {
		if (!editor || !value) return;

		isUploading = true;
		showImageDialog = false;

		try {
			if (value instanceof File) {
				const url = URL.createObjectURL(value);
				const mediaId = uuidv4().replace(/-/g, '');
				images[mediaId] = value;
				editor.chain().focus().setImage({ src: url, alt: value.name, 'data-media-id': mediaId }).run();
			} else {
				editor.chain().focus().setImage({ src: value.url, 'data-media-id': value._id }).run();
			}
		} finally {
			// Give a brief moment for the user to see the loader
			setTimeout(() => {
				isUploading = false;
			}, 300);
		}
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

	<!-- Rich Text Editor -->
	<div class="m-auto flex w-full flex-col items-center gap-2 overflow-auto rounded-lg border border-surface-300 dark:border-surface-700">
		{#if editor}
			<!-- Toolbar -->
			<div
				class="sticky top-0 z-10 flex w-full flex-wrap items-center gap-x-2 gap-y-1 border-b border-surface-300 bg-surface-100 p-2 dark:border-surface-700 dark:bg-surface-800"
				role="toolbar"
				aria-label="Rich text editor toolbar"
			>
				{#if isMobile.value}
					<button onclick={() => (showMobileMenu = !showMobileMenu)} class="btn-icon" aria-label="Toggle toolbar menu" aria-expanded={showMobileMenu}>
						<iconify-icon icon="mdi:menu" width="22"></iconify-icon>
					</button>
				{/if}

				<div class="flex flex-wrap items-center gap-x-2 gap-y-1" class:hidden={isMobile.value && !showMobileMenu}>
					<!-- TextType -->
					<DropDown show={show('textType')} items={textTypes} label="Text" bind:active={active_dropDown} />
					<!-- Font -->
					<DropDown show={show('font')} items={fonts} icon="gravity-ui:text" label="Font" bind:active={active_dropDown} />
					<!-- Color -->
					<ColorSelector
						show={show('color')}
						color={editor.getAttributes('textStyle').color || '#000000'}
						onChange={(color) => editor.chain().focus().setColor(color).run()}
						bind:active={active_dropDown}
					/>
					<!-- Font Size -->
					<div class="flex items-center" class:hidden={!show('fontSize')} role="group" aria-label="Font size controls">
						<input
							type="number"
							class="w-14 rounded-md border border-surface-300 bg-surface-50 p-1 text-center text-sm text-black outline-none focus:ring-2 focus:ring-primary-500 dark:border-surface-600 dark:bg-surface-700 dark:text-white"
							value={fontSize}
							onchange={handleFontSizeChange}
							aria-label="Font size"
							min="8"
							max="96"
						/>
					</div>

					<!-- Formatting Buttons -->
					<div class="flex items-center divide-x divide-surface-300 rounded-md border border-surface-300 dark:divide-surface-600 dark:border-surface-600" role="group" aria-label="Text formatting">
						<button class="btn-toolbar" class:hidden={!show('bold')} onclick={() => editor.chain().focus().toggleBold().run()} aria-pressed={editor.isActive('bold')} class:active={editor.isActive('bold')} title="Bold (Ctrl+B)" aria-label="Bold">
							<iconify-icon icon="bi:type-bold" width="22"></iconify-icon>
						</button>
						<button class="btn-toolbar" class:hidden={!show('italic')} onclick={() => editor.chain().focus().toggleItalic().run()} aria-pressed={editor.isActive('italic')} class:active={editor.isActive('italic')} title="Italic (Ctrl+I)" aria-label="Italic">
							<iconify-icon icon="bi:type-italic" width="22"></iconify-icon>
						</button>
						<button class="btn-toolbar" class:hidden={!show('strike')} onclick={() => editor.chain().focus().toggleStrike().run()} aria-pressed={editor.isActive('strike')} class:active={editor.isActive('strike')} title="Strikethrough" aria-label="Strikethrough">
							<iconify-icon icon="bi:type-strikethrough" width="22"></iconify-icon>
						</button>
						<button class="btn-toolbar" class:hidden={!show('link')} onclick={setLink} aria-pressed={editor.isActive('link')} class:active={editor.isActive('link')} title="Link" aria-label="Link">
							<iconify-icon icon="bi:link-45deg" width="20"></iconify-icon>
						</button>
					</div>

					<!-- Align -->
					<DropDown show={show('align')} items={alignText} label="Align" bind:active={active_dropDown} />
					<!-- Insert -->
					<DropDown show={show('insert')} items={inserts} icon="typcn:plus" label="Insert" bind:active={active_dropDown} />
					<!-- Float -->
					<DropDown show={show('float')} items={floats} icon="grommet-icons:text-wrap" label="Wrap" bind:active={active_dropDown} />

					<!-- Image Description -->
					<ImageDescription
						show={show('description')}
						value={editor.getAttributes('image')?.description}
						onSubmit={(description) => editor.chain().focus().setImageDescription(description).run()}
						bind:active={active_dropDown}
					/>
				</div>

				<!-- History & Status -->
				<div class="ml-auto flex items-center gap-2">
					<!-- History -->
					<div class="flex items-center divide-x divide-surface-300 rounded-md border border-surface-300 dark:divide-surface-600 dark:border-surface-600" role="group" aria-label="History actions">
						<button class="btn-toolbar" onclick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo (Ctrl+Z)" aria-label="Undo">
							<iconify-icon icon="mdi:undo" width="22"></iconify-icon>
						</button>
						<button class="btn-toolbar" onclick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo (Ctrl+Y)" aria-label="Redo">
							<iconify-icon icon="mdi:redo" width="22"></iconify-icon>
						</button>
					</div>
				</div>
			</div>

			<!-- Editor Container -->
			<div class="relative min-h-[400px] w-full flex-grow">
				{#if isUploading}
					<div class="absolute inset-0 z-20 flex items-center justify-center bg-black bg-opacity-50">
						<div class="loader"></div>
						<span class="ml-4 text-white">Uploading...</span>
					</div>
				{/if}
				<div
					bind:this={element}
					role="textbox"
					class="h-full w-full cursor-text"
					class:error-outline={!!validationError}
					aria-label="Rich text editor content"
					aria-multiline="true"
					aria-required={!!field?.required}
					dir={getTextDirection(_language) as 'ltr' | 'rtl'}
				>
					<!-- Editor content will be inserted here by TipTap -->
				</div>
			</div>

			<!-- Footer with Character Count -->
			<div class="w-full border-t border-surface-300 bg-surface-50 p-2 text-right text-xs text-gray-500 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-400">
				{editor.storage.characterCount?.characters() || 0} characters | {editor.storage.characterCount?.words() || 0} words
			</div>
		{/if}
	</div>

	<!-- Modals -->
	<FileInput show={showImageDialog} onchange={handleFileChange} onclose={() => (showImageDialog = false)} />
	<VideoDialog bind:show={showVideoDialog} {editor} />

	<!-- Error Message -->
	{#if validationError}
		<p id={`${getFieldName(field)}-error`} class="mt-1 w-full text-center text-sm text-error-500" role="alert">
			{validationError}
		</p>
	{/if}
</div>

<style lang="postcss">
	.btn-toolbar {
		@apply p-2 transition-colors duration-200 hover:bg-surface-200 disabled:cursor-not-allowed disabled:text-surface-400 dark:hover:bg-surface-700 dark:disabled:text-surface-500;
	}
	.btn-toolbar.active {
		@apply bg-primary-500 text-white;
	}
	.btn-icon {
		@apply rounded-md p-2 transition-colors duration-200 hover:bg-surface-200 dark:hover:bg-surface-700;
	}
	.error-outline {
		@apply ring-2 ring-error-500 ring-offset-2;
	}
	.input-container {
		min-height: 2.5rem;
	}
	.error {
		border-color: rgb(239 68 68);
	}

	/* Tiptap Specific Styles */
	:global(.tiptap) {
		@apply h-full;
	}
	:global(.ProseMirror-selectednode) {
		@apply outline outline-2 outline-primary-500;
	}
	:global(.dark .ProseMirror) {
		color: white;
	}
	:global(.dark .ProseMirror p) {
		color: white;
	}
	:global(.dark .ProseMirror h1),
	:global(.dark .ProseMirror h2),
	:global(.dark .ProseMirror h3),
	:global(.dark .ProseMirror h4) {
		color: white;
	}

	/* Loader animation */
	.loader {
		border: 4px solid #f3f3f3;
		border-top: 4px solid #3498db;
		border-radius: 50%;
		width: 40px;
		height: 40px;
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}
</style>

