<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { onMount, onDestroy, tick } from 'svelte';
	import type { ComponentProps } from 'svelte';
	import type { FieldType } from '.';
	import { meta_data, createRandomID, debounce, getFieldName, updateTranslationProgress } from '@src/utils/utils';

	// Stores
	import { entryData, mode, contentLanguage } from '@src/stores/store';

	// Components
	import DropDown from './DropDown.svelte';
	import ColorSelector from './ColorSelector.svelte';
	import ImageResize from './ImageResize';
	import FileInput from '@src/components/system/inputs/FileInput.svelte';

	// Skeleton
	import { ListBox, ListBoxItem, popup, type PopupSettings } from '@skeletonlabs/skeleton';

	const popupCombobox: PopupSettings = {
		event: 'click',
		target: 'popupCombobox',
		placement: 'bottom-start',
		closeQuery: '.listbox-item'
	};

	// TipTap
	import StarterKit from '@tiptap/starter-kit'; // enables you to use the editor
	import { Editor, Extension } from '@tiptap/core'; // enables you to use the editor
	import TextStyle from './TextStyle'; // enables you to set the text style
	import FontFamily from '@tiptap/extension-font-family'; // enables you to set the font family
	import Color from '@tiptap/extension-color'; // enables you to set the font color
	import TextAlign from '@tiptap/extension-text-align'; //adds a text align attribute to a specified list of nodes
	import Link from '@tiptap/extension-link'; // adds support for <a> tags
	import BulletList from '@tiptap/extension-bullet-list'; // adds support for <ul> tags
	import ListItem from '@tiptap/extension-list-item'; // adds support for the <li> HTML tag

	export let field: FieldType;
	export const WidgetData = async () => ({ images, data: _data });

	let fieldName = getFieldName(field);
	let element;
	let editor: Editor;
	let showImageDialog = false;
	let images = {};

	export let value = $entryData[fieldName] || { content: {}, header: {} };

	let _data = $mode == 'create' ? { content: {}, header: {} } : value;
	$: _language = field?.translated ? $contentLanguage : publicEnv.DEFAULT_CONTENT_LANGUAGE;

	contentLanguage.subscribe(async (val) => {
		await tick();
		editor && editor.commands.setContent(_data.content[val] || '');
	});

	$: updateTranslationProgress(_data.content, field);
	let deb = debounce(500);

	onMount(() => {
		editor = new Editor({
			element: element,
			extensions: [
				StarterKit,
				Link,
				TextStyle,
				FontFamily,
				Color,
				ImageResize,
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

			content: Object.keys(_data.content).length > 0 ? _data.content[_language] : value.content[_language] || '',

			onTransaction: ({ transaction }) => {
				// force re-render so `editor.isActive` works as expected
				handleImageDeletes(transaction);
				editor = editor;
				deb(() => {
					let content = editor.getHTML();
					content == '<p></p>' && (content = '');
					_data.content[_language] = content;
				});
			}
		});
	});

	function handleImageDeletes(transaction) {
		const getImageIds = (fragment) => {
			let srcs = new Set();
			fragment.forEach((node) => {
				if (node.type.name === 'image') {
					srcs.add(node.attrs.media_image);
				}
			});
			return srcs;
		};

		let currentIds = getImageIds(transaction.doc.content);
		let previousIds = getImageIds(transaction.before.content);

		// Determine which images were deleted
		let deletedImageIds = [...previousIds].filter((id) => !currentIds.has(id)) as string[];

		if (deletedImageIds.length > 0) {
			meta_data.add('media_images_remove', deletedImageIds);
		}
	}

	onDestroy(() => {
		if (editor) {
			editor.destroy();
		}
	});

	let textTypes: ComponentProps<ListBox>['items'];
	let fonts: ComponentProps<ListBox>['items'];
	let alignText: ComponentProps<ListBox>['items'];
	let inserts: ComponentProps<ListBox>['items'];

	$: textTypes = [
		{
			name: 'Paragraph',
			icon: 'bi:paragraph',
			active: () => editor.isActive('paragraph'),
			onClick: () => editor.chain().focus().setParagraph().run()
		},
		{
			name: 'Heading',
			icon: 'bi:type-h1',
			active: () => editor.isActive('heading', { level: 1 }),
			onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run()
		},
		{
			name: 'Heading',
			icon: 'bi:type-h2',
			active: () => editor.isActive('heading', { level: 2 }),
			onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run()
		},
		{
			name: 'Heading',
			icon: 'bi:type-h3',
			active: () => editor.isActive('heading', { level: 3 }),
			onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run()
		},
		{
			name: 'Heading',
			icon: 'bi:type-h4',
			active: () => editor.isActive('heading', { level: 4 }),
			onClick: () => editor.chain().focus().toggleHeading({ level: 4 }).run()
		}
	];

	$: fonts = [
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
		},

		{
			name: 'Times New Roman',
			active: () => editor.isActive('textStyle', { fontFamily: 'Times New Roman' }),
			onClick: () => editor.chain().focus().setFontFamily('Times New Roman').run()
		},
		{
			name: 'Georgia',
			active: () => editor.isActive('textStyle', { fontFamily: 'Georgia' }),
			onClick: () => editor.chain().focus().setFontFamily('Georgia').run()
		},
		{
			name: 'Garamond',
			active: () => editor.isActive('textStyle', { fontFamily: 'Garamond' }),
			onClick: () => editor.chain().focus().setFontFamily('Garamond').run()
		}
	];

	$: alignText = [
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
			onClick: () => editor.commands.setTextAlign('right')
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

	$: inserts = [
		{
			name: 'image',
			icon: 'fa6-solid:image',
			onClick: () => {
				showImageDialog = true;
			},
			active: () => editor.isActive('image')
		}
	];

	$: floats = [
		{
			name: 'wrap left',
			icon: 'teenyicons:align-left-solid',
			onClick: () => editor.chain().focus().setImageFloat('left').run(),
			active: () => false
		},
		{
			name: 'wrap right',
			icon: 'teenyicons:align-right-solid',
			onClick: () => editor.chain().focus().setImageFloat('right').run(),
			active: () => false
		},
		{
			name: 'unwrap',
			icon: 'mdi:filter-remove',
			onClick: () => editor.chain().focus().setImageFloat('unset').run(),
			active: () => false
		}
	];

	let fontSize = 16;
	$: editor &&
		(fontSize =
			editor.getAttributes('textStyle').fontSize ||
			window.getComputedStyle(window.getSelection()?.focusNode?.parentElement || (element as HTMLElement)).fontSize.replace('px', ''));

	let show = (
		button: 'textType' | 'font' | 'align' | 'insert' | 'float' | 'color' | 'bold' | 'italic' | 'underline' | 'strike' | 'link' | 'fontSize'
	) => {
		if (['textType', 'font', 'insert', 'color', 'bold', 'italic', 'underline', 'strike', 'link', 'fontSize'].includes(button)) {
			return !editor?.isActive('image');
		}
		if (['float'].includes(button)) {
			return editor?.isActive('image');
		}
		return true;
	};

	$: {
		show = show;
		editor;
	}
</script>

<input type="text" bind:value={_data.header[_language]} placeholder="Title" class="input mt-2 !w-full" />

<!-- Rich Text Editor -->
<div class="m-auto flex max-h-[500px] w-full flex-col items-center gap-2 overflow-auto">
	{#if editor}
		<!-- Toolbar -->
		<div class="sticky top-0 z-10 flex w-full items-center justify-center gap-1">
			<!-- textTypes -->
			<!-- <button class="variant-filled btn w-48 items-center justify-between" use:popup={popupCombobox}>
				<span class="capitalize">{textTypes[editor.getAttributes('textTypes').textType] ?? 'Types'}</span>
				<span><iconify-icon icon="mdi:chevron-down" width="20" /></span>
			</button>

			<div class="card border border-surface-300 shadow-xl" data-popup="popupCombobox">
				<ListBox rounded="bg-white ">
					{#each textTypes as item}
						<ListBoxItem bind:group={item} name={item.name} value={item.name}>
							<div class="grid w-24 grid-cols-3 items-center justify-center text-black">
								<iconify-icon icon={item.icon} width="22" class="col-span-1" />
								<p class="col-span-auto text-left">{item.name}</p>
							</div>
						</ListBoxItem>
					{/each}
				</ListBox>
			</div> -->

			<!-- fonts -->
			<!-- <button class="variant-filled btn w-48 justify-between" use:popup={popupCombobox}>
				<span class="capitalize">{fonts.find((font) => font.name === editor.getAttributes('fonts').fontName)?.name ?? 'Fonts'}</span>

				<span><iconify-icon icon="mdi:chevron-down" width="20" /></span>
			</button>

			<div class="w-38 card border border-surface-300 shadow-xl" data-popup="popupCombobox">
				<ListBox rounded="bg-white ">
					{#each fonts as item}
						<ListBoxItem bind:group={item} name={item.name} value={item.name}>
							<div class="grid w-24 grid-cols-3 items-center justify-center text-black">
								<iconify-icon icon={item.icon} width="22" class="col-span-1" />
								<p class="col-span-auto text-left">{item.name}</p>
							</div>
						</ListBoxItem>
					{/each}
				</ListBox>
			</div> -->

			<DropDown show={show('textType')} items={textTypes} label="Text" />
			<DropDown show={show('font')} items={fonts} icon="gravity-ui:text" label="Font" />

			<ColorSelector
				show={show('color')}
				color={editor.getAttributes('textStyle').color || '#000000'}
				on:change={(e) => editor.chain().focus().setColor(e.detail).run()}
			/>

			<button class="btn-group" class:hidden={!show('fontSize')}>
				<!-- Size -->
				<button
					on:click={() => {
						fontSize--;
						editor.chain().focus().setFontSize(fontSize).run();
					}}
				>
					<iconify-icon icon="bi:dash-lg" width="22" />
				</button>

				<input type="text" class="w-[30px] text-center outline-none" bind:value={fontSize} />

				<button
					on:click={() => {
						fontSize++;
						editor.chain().focus().setFontSize(fontSize).run();
					}}
				>
					<iconify-icon icon="bi:plus-lg" width="22" />
				</button>
			</button>

			<button class="divide-x">
				<!-- Bold -->
				<button class:hidden={!show('bold')} on:click={() => editor.chain().focus().toggleBold().run()} class:active={editor.isActive('bold')}>
					<iconify-icon icon="bi:type-bold" width="22" />
				</button>

				<!-- Italic -->
				<button class:hidden={!show('italic')} on:click={() => editor.chain().focus().toggleItalic().run()} class:active={editor.isActive('italic')}>
					<iconify-icon icon="bi:type-italic" width="22" />
				</button>

				<!-- Underline -->
				<button
					class:hidden={!show('underline')}
					on:click={() => editor.chain().focus().toggleStrike().run()}
					class:active={editor.isActive('underline')}
				>
					<iconify-icon icon="bi:type-underline" width="22" />
				</button>

				<!-- Strikethrough -->
				<button class:hidden={!show('strike')} on:click={() => editor.chain().focus().toggleStrike().run()} class:active={editor.isActive('strike')}>
					<iconify-icon icon="bi:type-strikethrough" width="22" />
				</button>

				<!-- Link -->
				<button
					class:hidden={!show('link')}
					on:click={() => editor.chain().focus().toggleLink({ href: 'https://google.com' }).run()}
					class:active={editor.isActive('link')}
				>
					<iconify-icon icon="bi:link-45deg" width="20" />
				</button>
			</button>

			<DropDown show={show('align')} items={alignText} label="Align" />
			<DropDown show={show('insert')} items={inserts} icon="typcn:plus" label="Insert" />
			<DropDown show={show('float')} items={floats} icon="grommet-icons:text-wrap" label="Text Wrap" />
			<!-- <FileInput
				bind:show={showImageDialog}
				class="absolute bg-white top-0 z-10"
				on:change={(e) => {
					let data = e.detail;
					let url;
					if (data instanceof File) {
						url = URL.createObjectURL(data);
						let image_id = createRandomID().toString();
						images[image_id] = data;
						editor.chain().focus().setImage({ src: url, id: image_id }).run();
					} else {
						url = data.original.url;

						editor.chain().focus().setImage({ src: url, media_image: data._id }).run();
					}
				}}
			/> -->
		</div>
	{/if}

	<!-- Text Area -->
	<div
		on:pointerdown|self={() => editor.commands.focus('end')}
		bind:this={element}
		class="RichText min-h-[calc(100vh-80px)] w-full flex-grow cursor-text overflow-auto"
	/>
</div>

<style lang="postcss">
	@import 'RichText.css';

	button.active {
		color: rgb(0, 255, 123);
	}
	:global(.tiptap) {
		outline: none;
	}

	:global(.ProseMirror-selectednode img) {
		box-shadow: 0px 0px 4px 0px #34363699 inset;
	}
</style>
