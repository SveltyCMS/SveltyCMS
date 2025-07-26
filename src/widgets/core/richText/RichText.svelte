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
	import { publicEnv } from '@root/config/public';
	import { onMount, onDestroy, tick, untrack } from 'svelte';
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
	import ImageResize from './extensions/ImageResize';
	import ImageDescription from './components/ImageDescription.svelte';
	import FileInput from '@components/system/inputs/FileInput.svelte';
	import VideoDialog from './components/VideoDialog.svelte';

	// TipTap
	import StarterKit from '@tiptap/starter-kit';
	import { Editor, Extension } from '@tiptap/core';
	import TextStyle from './extensions/TextStyle';
	import TextAlign from '@tiptap/extension-text-align';
	import FontFamily from '@tiptap/extension-font-family';
	import Color from '@tiptap/extension-color';
	import Link from '@tiptap/extension-link';
	import Youtube from '@tiptap/extension-youtube';
	import CharacterCount from '@tiptap/extension-character-count';
	import Table from '@tiptap/extension-table';
	import TableRow from '@tiptap/extension-table-row';
	import TableCell from '@tiptap/extension-table-cell';
	import TableHeader from '@tiptap/extension-table-header';

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
	let _language = $derived(field?.translated ? $contentLanguage : publicEnv.DEFAULT_CONTENT_LANGUAGE);

	// Update editor content when language changes
	$effect(() => {
		if (editor && _language) {
			const content = _data.content[_language] || value?.content?.[_language] || '';
			editor.commands.setContent(content);
		}
	});

	const deb = debounce(500);

	// Validation function
	function validateContent() {
		const fieldId = getFieldName(field);
		if (field?.required && (!_data.content[_language] || _data.content[_language] === '<p></p>')) {
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
			parseOptions: { preserveWhitespace: 'full' },
			element: element,
			extensions: [
				StarterKit,
				Link,
				TextStyle,
				FontFamily,
				Color,
				Youtube,
				ImageResize,
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
					name: 'Tab',
					addKeyboardShortcuts() {
						return {
							Tab: () => {
								return this.editor.commands.insertContent('\t');
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

			onUpdate: () => {
				active_dropDown = ''; // force re-render for active states
				deb(() => {
					if (!editor) return;
					let content = editor.getHTML();
					content == '<p></p>' && (content = '');
					_data.content[_language] = content;
					validateContent();
				});
			},

			onTransaction: ({ transaction }) => {
				handleImageDeletes(transaction);
			}
		});

		// Focus the editor after initialization
		tick().then(() => {
			editor?.commands.focus('start');
		});
	});

	function handleImageDeletes(transaction: any) {
		const getImageIds = (fragment: any) => {
			let srcs = new Set<string>();
			let obj = new Map<string, { id: string; src: string }>();
			fragment.forEach((node: any) => {
				if (node.type.name === 'image') {
					srcs.add(node.attrs.media_image);
					obj.set(node.attrs.id, { id: node.attrs.id, src: node.attrs.src });
				}
			});
			return { srcs, obj };
		};

		let current = getImageIds(transaction.doc.content);
		let previous = getImageIds(transaction.before.content);
		// Determine which images were deleted
		let deletedImageSrcs = [...previous.srcs].filter((src) => src && !current.srcs.has(src)) as string[];
		for (let obj of previous.obj) {
			if (!current.obj.has(obj[0])) {
				images[obj[0]] && delete images[obj[0]];
			}
		}

		if (deletedImageSrcs.length > 0) {
			meta_data.add('media_images_remove', deletedImageSrcs);
		}
	}

	onDestroy(() => {
		if (editor) {
			editor.destroy();
		}
	});

	// Text Types
	let textTypes: ComponentProps<typeof DropDown>['items'] = $derived.by(() => {
		editor;
		return [
			{
				name: 'Paragraph',
				icon: 'bi:paragraph',
				active: () => editor?.isActive('paragraph') ?? false,
				onClick: () => editor?.chain().focus().setParagraph().run()
			},
			{
				name: 'Heading',
				icon: 'bi:type-h1',
				active: () => editor?.isActive('heading', { level: 1 }) ?? false,
				onClick: () => editor?.chain().focus().toggleHeading({ level: 1 }).run()
			},
			{
				name: 'Heading',
				icon: 'bi:type-h2',
				active: () => editor?.isActive('heading', { level: 2 }) ?? false,
				onClick: () => editor?.chain().focus().toggleHeading({ level: 2 }).run()
			},
			{
				name: 'Heading',
				icon: 'bi:type-h3',
				active: () => editor?.isActive('heading', { level: 3 }) ?? false,
				onClick: () => editor?.chain().focus().toggleHeading({ level: 3 }).run()
			},
			{
				name: 'Heading',
				icon: 'bi:type-h4',
				active: () => editor?.isActive('heading', { level: 4 }) ?? false,
				onClick: () => editor?.chain().focus().toggleHeading({ level: 4 }).run()
			}
		];
	});

	// Fonts
	let fonts: ComponentProps<typeof DropDown>['items'] = $derived.by(() => {
		editor;
		return [
			{
				name: 'Arial',
				active: () => editor?.isActive('textStyle', { fontFamily: 'Arial' }) ?? false,
				onClick: () => editor?.chain().focus().setFontFamily('Arial').run()
			},
			{
				name: 'Verdana',
				active: () => editor?.isActive('textStyle', { fontFamily: 'Verdana' }) ?? false,
				onClick: () => editor?.chain().focus().setFontFamily('Verdana').run()
			},
			{
				name: 'Tahoma',
				active: () => editor?.isActive('textStyle', { fontFamily: 'Tahoma' }) ?? false,
				onClick: () => editor?.chain().focus().setFontFamily('Tahoma').run()
			},
			{
				name: 'Times New Roman',
				active: () => editor?.isActive('textStyle', { fontFamily: 'Times New Roman' }) ?? false,
				onClick: () => editor?.chain().focus().setFontFamily('Times New Roman').run()
			},
			{
				name: 'Georgia',
				active: () => editor?.isActive('textStyle', { fontFamily: 'Georgia' }) ?? false,
				onClick: () => editor?.chain().focus().setFontFamily('Georgia').run()
			},
			{
				name: 'Garamond',
				active: () => editor?.isActive('textStyle', { fontFamily: 'Garamond' }) ?? false,
				onClick: () => editor?.chain().focus().setFontFamily('Garamond').run()
			}
		];
	});

	// Alignment
	let alignText: ComponentProps<typeof DropDown>['items'] = $derived.by(() => {
		editor;
		return [
			{
				name: 'left',
				icon: 'fa6-solid:align-left',
				active: () => editor?.isActive({ textAlign: 'left' }) ?? false,
				onClick: () => editor?.chain().focus().setTextAlign('left').run()
			},
			{
				name: 'right',
				icon: 'fa6-solid:align-right',
				active: () => editor?.isActive({ textAlign: 'right' }) ?? false,
				onClick: () => editor?.chain().focus().setTextAlign('right').run()
			},
			{
				name: 'center',
				icon: 'fa6-solid:align-center',
				active: () => editor?.isActive({ textAlign: 'center' }) ?? false,
				onClick: () => editor?.chain().focus().setTextAlign('center').run()
			},
			{
				name: 'justify',
				icon: 'fa6-solid:align-justify',
				active: () => editor?.isActive({ textAlign: 'justify' }) ?? false,
				onClick: () => editor?.chain().focus().setTextAlign('justify').run()
			}
		];
	});

	// Insert
	let inserts: ComponentProps<typeof DropDown>['items'] = $derived.by(() => {
		editor;
		return [
			{
				name: 'image',
				icon: 'fa6-solid:image',
				onClick: () => {
					showImageDialog = true;
				},
				active: () => editor?.isActive('image') ?? false
			},
			{
				name: 'video',
				icon: 'fa6-solid:video',
				onClick: () => {
					showVideoDialog = true;
				},
				active: () => editor?.isActive('video') ?? false
			},
			{
				name: 'table',
				icon: 'bi:table',
				onClick: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
				active: () => editor?.isActive('table') ?? false
			}
		];
	});

	// Float
	let floats: ComponentProps<typeof DropDown>['items'] = $derived.by(() => {
		editor;
		return [
			{
				name: 'wrap left',
				icon: 'teenyicons:align-left-solid',
				onClick: () => editor?.chain().focus().setImageFloat('left').run(),
				active: () => false
			},
			{
				name: 'wrap right',
				icon: 'teenyicons:align-right-solid',
				onClick: () => editor?.chain().focus().setImageFloat('right').run(),
				active: () => false
			},
			{
				name: 'unwrap',
				icon: 'mdi:filter-remove',
				onClick: () => editor?.chain().focus().setImageFloat('unset').run(),
				active: () => false
			}
		];
	});

	// Font Size
	let fontSize = $state(16);
	$effect(() => {
		if (!editor || !element) return;
		fontSize =
			editor.getAttributes('textStyle').fontSize ||
			window.getComputedStyle(window.getSelection()?.focusNode?.parentElement || element).fontSize.replace('px', '');
	});

	// Show button
	function show(
		button: 'textType' | 'font' | 'align' | 'insert' | 'float' | 'color' | 'bold' | 'italic' | 'strike' | 'link' | 'fontSize' | 'description'
	) {
		if (!editor) return false;
		if (editor.isActive('image')) {
			return ['float', 'align', 'description'].includes(button);
		}
		if (['description', 'float'].includes(button)) {
			return false;
		}
		return true;
	}

	function handleFontSizeDecrease() {
		fontSize--;
		editor?.chain().focus().setFontSize(fontSize).run();
	}

	function handleFontSizeIncrease() {
		fontSize++;
		editor?.chain().focus().setFontSize(fontSize).run();
	}

	function handleBoldClick() {
		editor?.chain().focus().toggleBold().run();
	}

	function handleItalicClick() {
		editor?.chain().focus().toggleItalic().run();
	}

	function handleStrikeClick() {
		editor?.chain().focus().toggleStrike().run();
	}

	function handleLinkClick() {
		editor?.chain().focus().toggleLink({ href: 'https://google.com' }).run();
	}

	let isUploading = $state(false);
	let uploadTimeout: ReturnType<typeof setTimeout> | null = null;

	function handleFileChange(value: File | MediaImage) {
		if (!editor) return;

		let url;
		// Start a timer to show loader only if upload is slow (e.g. > 700ms)
		if (uploadTimeout) clearTimeout(uploadTimeout);
		isUploading = false;
		uploadTimeout = setTimeout(() => {
			isUploading = true;
		}, 700);

		if (value instanceof File) {
			url = URL.createObjectURL(value);
			let image_id = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
			images[image_id] = value;
			editor.chain().focus().setImage({ src: url, id: image_id }).run();
			// Simulate upload delay for UX
			setTimeout(() => {
				isUploading = false;
				if (uploadTimeout) clearTimeout(uploadTimeout);
			}, 500);
		} else {
			// Use the MediaImage url property directly
			url = value.url;
			editor.chain().focus().setImage({ src: url, storage_image: value._id }).run();
			isUploading = false;
			if (uploadTimeout) clearTimeout(uploadTimeout);
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
	<div class="m-auto flex max-h-[500px] w-full flex-col items-center gap-2 overflow-auto">
		{#if editor}
			<!-- Toolbar -->
			<div
				class="sticky top-0 z-10 my-1 flex w-full flex-wrap items-center justify-center gap-1 bg-surface-500"
				role="toolbar"
				aria-label="Rich text editor toolbar"
			>
				{#if isMobile.value}
					<button onclick={() => (showMobileMenu = !showMobileMenu)} class="btn" aria-label="Toggle toolbar menu" aria-expanded={showMobileMenu}>
						<iconify-icon icon="mdi:menu" width="22"></iconify-icon>
					</button>
				{/if}

				<div class="flex flex-wrap gap-1" class:hidden={isMobile.value && !showMobileMenu}>
					<!-- TextType -->
					<DropDown show={show('textType')} items={textTypes} label="Text" bind:active={active_dropDown} />
					<!-- Font -->
					<DropDown show={show('font')} items={fonts} icon="gravity-ui:text" label="Font" bind:active={active_dropDown} />
					<!-- Color -->
					<ColorSelector
						show={show('color')}
						color={editor?.getAttributes('textStyle').color || '#000000'}
						onChange={(color) => editor?.chain().focus().setColor(color).run()}
						bind:active={active_dropDown}
					/>

					<div class="flex items-center" class:hidden={!show('fontSize')} role="group" aria-label="Font size controls">
						<!-- Size -->
						<button
							onclick={handleFontSizeDecrease}
							onkeydown={(e) => e.key === 'Enter' && handleFontSizeDecrease()}
							aria-label="Decrease Font Size"
							class="btn"
							tabindex="0"
						>
							<iconify-icon icon="bi:dash-lg" width="22"></iconify-icon>
						</button>

						<input
							type="text"
							class="w-12 text-center text-sm text-black outline-none"
							bind:value={fontSize}
							aria-label="Font size"
							role="spinbutton"
							aria-valuenow={fontSize}
							aria-valuemin="1"
							aria-valuemax="100"
						/>

						<button
							onclick={handleFontSizeIncrease}
							onkeydown={(e) => e.key === 'Enter' && handleFontSizeIncrease()}
							aria-label="Increase Font Size"
							class="btn"
							tabindex="0"
						>
							<iconify-icon icon="bi:plus-lg" width="22"></iconify-icon>
						</button>
					</div>
				</div>
			</div>

			<div class="divide-x" role="group" aria-label="Text formatting">
				<!-- Bold -->
				<button
					class:hidden={!show('bold')}
					onclick={handleBoldClick}
					onkeydown={(e) => e.key === 'Enter' && handleBoldClick()}
					aria-label="Bold"
					aria-pressed={editor?.isActive('bold') ?? false}
					class:active={editor?.isActive('bold') ?? false}
					tabindex="0"
				>
					<iconify-icon icon="bi:type-bold" width="22"></iconify-icon>
				</button>

				<!-- Italic -->
				<button
					class:hidden={!show('italic')}
					onclick={handleItalicClick}
					onkeydown={(e) => e.key === 'Enter' && handleItalicClick()}
					aria-label="Italic"
					aria-pressed={editor?.isActive('italic') ?? false}
					class:active={editor?.isActive('italic') ?? false}
					tabindex="0"
				>
					<iconify-icon icon="bi:type-italic" width="22"></iconify-icon>
				</button>

				<!-- Strikethrough -->
				<button
					class:hidden={!show('strike')}
					onclick={handleStrikeClick}
					onkeydown={(e) => e.key === 'Enter' && handleStrikeClick()}
					aria-label="Strikethrough"
					aria-pressed={editor?.isActive('strike') ?? false}
					class:active={editor?.isActive('strike') ?? false}
					tabindex="0"
				>
					<iconify-icon icon="bi:type-strikethrough" width="22"></iconify-icon>
				</button>

				<!-- Link -->
				<button
					class:hidden={!show('link')}
					onclick={handleLinkClick}
					onkeydown={(e) => e.key === 'Enter' && handleLinkClick()}
					aria-label="Link"
					aria-pressed={editor?.isActive('link') ?? false}
					class:active={editor?.isActive('link') ?? false}
					tabindex="0"
				>
					<iconify-icon icon="bi:link-45deg" width="20"></iconify-icon>
				</button>
			</div>

			<!-- Align -->
			<DropDown show={show('align')} items={alignText} label="Align" bind:active={active_dropDown} />
			<!-- Insert -->
			<DropDown show={show('insert')} items={inserts} icon="typcn:plus" label="Insert" bind:active={active_dropDown} />
			<!-- Float -->
			<DropDown show={show('float')} items={floats} icon="grommet-icons:text-wrap" label="Text Wrap" bind:active={active_dropDown} />

			<!-- Image Description -->
			<ImageDescription
				show={show('description')}
				value={editor?.getAttributes('image')?.description}
				onSubmit={(description) => editor?.chain().focus().setImageDescription(description).run()}
				bind:active={active_dropDown}
			/>

			<!-- Image -->
			<FileInput show={showImageDialog} on:change={handleFileChange} className="fixed left-1/2 top-0 z-10 -translate-x-1/2 bg-white" />

			<!-- Video -->
			<VideoDialog bind:show={showVideoDialog} {editor} />

			<div class="divide-x" role="group" aria-label="History actions">
				<button
					onclick={() => editor?.chain().focus().undo().run()}
					onkeydown={(e) => e.key === 'Enter' && editor?.chain().focus().undo().run()}
					aria-label="Undo"
					class="btn"
					tabindex="0"
					disabled={!editor?.can().undo()}
				>
					<iconify-icon icon="mdi:undo" width="22"></iconify-icon>
				</button>

				<button
					onclick={() => editor?.chain().focus().redo().run()}
					onkeydown={(e) => e.key === 'Enter' && editor?.chain().focus().redo().run()}
					aria-label="Redo"
					class="btn"
					tabindex="0"
					disabled={!editor?.can().redo()}
				>
					<iconify-icon icon="mdi:redo" width="22"></iconify-icon>
				</button>
			</div>

			<!-- Character Count -->
			<div class="ml-auto p-2 text-xs text-gray-500 dark:text-gray-400">
				{editor.storage.characterCount?.characters() || 0} characters | {editor.storage.characterCount?.words() || 0} words
			</div>
		{/if}

		<!-- Editor Container -->
		<div
			bind:this={element}
			role="textbox"
			tabindex="0"
			class="min-h-[calc(100vh-80px)] w-full flex-grow cursor-text overflow-auto dark:text-white"
			class:error={!!validationError}
			aria-label="Rich text editor"
			aria-multiline="true"
			aria-required={!!field?.required}
			dir={getTextDirection(_language) as 'ltr' | 'rtl'}
		>
			<!-- Editor content will be inserted here by TipTap -->
		</div>
	</div>

	<!-- Error Message -->
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

	:global(.ProseMirror-selectednode img) {
		box-shadow: 0px 0px 4px 0px #34363699 inset;
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
