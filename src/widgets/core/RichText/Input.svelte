<!--
@file src/widgets/core/RichText/Input.svelte
@component SveltyCMS – Enterprise RichText Editor (2025 Edition)
-->

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { slide } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { createEditor } from './tiptap';
	import type { Editor } from '@tiptap/core';
	import type { FieldType } from './';
	import type { RichTextData } from './types';
	import { contentLanguage } from '@src/stores/store.svelte';
	import { modalState } from '@utils/modalState.svelte';
	import MediaLibraryModal from '@components/MediaLibraryModal.svelte';
	import { tokenTarget } from '@src/services/token/tokenTarget';

	let {
		field,
		value = $bindable(),
		error
	}: {
		field: FieldType;
		value: Record<string, RichTextData> | null | undefined;
		error?: string | null;
	} = $props();

	const lang = $derived(field.translated ? $contentLanguage : 'default');

	$effect(() => {
		if (!value) value = {};
		if (!value[lang]) value[lang] = { title: '', content: '' };
	});

	let editor: Editor | null = $state(null);
	let element: HTMLDivElement;

	let isScrolled = $state(false);
	let showSlashMenu = $state(false);
	let showSource = $state(false); // Source View Toggle
	let activeDropdown = $state<string | null>(null);
	let colorInput: HTMLInputElement;

	// Table Picker State
	let hoverRows = $state(0);
	let hoverCols = $state(0);

	function toggleDropdown(label: string, event: MouseEvent) {
		event.stopPropagation();
		activeDropdown = activeDropdown === label ? null : label;
	}

	function closeDropdowns() {
		activeDropdown = null;
	}

	function handleColorChange(e: Event) {
		const color = (e.target as HTMLInputElement).value;
		editor?.chain().focus().setColor(color).run();
	}

	// New Feature Functions
	function openMediaLibrary() {
		modalState.trigger(
			MediaLibraryModal as any,
			{}, // No specific props needed for single select?
			(files: any) => {
				// Using any for result to avoid type complexity for now
				if (files && files.length > 0) {
					// Insert the first selected image
					const file = files[0];
					editor?.chain().focus().setImage({ src: file.url, alt: file.name }).run();
				}
			}
		);
	}

	async function pasteUnformatted() {
		try {
			const text = await navigator.clipboard.readText();
			editor?.chain().focus().insertContent(text).run();
		} catch (err) {
			console.error('Failed to read clipboard:', err);
			alert('Could not access clipboard. Please check permissions.');
		}
	}

	function setVideo() {
		const url = prompt('Enter YouTube URL');
		if (url) {
			editor?.chain().focus().setYoutubeVideo({ src: url }).run();
		}
	}

	// Toolbar types
	type ToolbarButton = {
		type?: 'button';
		icon: string;
		label: string;
		shortcut?: string;
		cmd: () => void;
		active?: () => boolean;
	};

	type ToolbarDropdown = {
		type: 'dropdown';
		label: string;
		icon?: string;
		items?: { label: string; cmd: () => void; active: () => boolean }[];
	};

	type ToolbarItem = ToolbarButton | ToolbarDropdown;

	type ToolbarGroup = {
		condition?: () => boolean;
		buttons: ToolbarItem[];
	};

	// Toolbar config – using official Material Design Icons (mdi)
	const toolbarGroups: ToolbarGroup[] = [
		{
			buttons: [
				{
					type: 'button',
					icon: 'arrow-u-left-top',
					label: 'Undo',
					shortcut: 'Ctrl+Z',
					cmd: () => editor?.chain().focus().undo().run(),
					active: () => false
				},
				{
					type: 'button',
					icon: 'arrow-u-right-top',
					label: 'Redo',
					shortcut: 'Ctrl+Shift+Z',
					cmd: () => editor?.chain().focus().redo().run(),
					active: () => false
				}
			]
		},
		{
			buttons: [
				{
					type: 'button',
					icon: 'format-bold',
					label: 'Bold',
					shortcut: 'Ctrl+B',
					cmd: () => editor?.chain().focus().toggleBold().run(),
					active: () => editor?.isActive('bold') ?? false
				},
				{
					type: 'button',
					icon: 'format-italic',
					label: 'Italic',
					shortcut: 'Ctrl+I',
					cmd: () => editor?.chain().focus().toggleItalic().run(),
					active: () => editor?.isActive('italic') ?? false
				},
				{
					type: 'button',
					icon: 'format-underlined',
					label: 'Underline',
					shortcut: 'Ctrl+U',
					cmd: () => editor?.chain().focus().toggleUnderline().run(),
					active: () => editor?.isActive('underline') ?? false
				},
				{
					type: 'button',
					icon: 'format-strikethrough-variant',
					label: 'Strikethrough',
					cmd: () => editor?.chain().focus().toggleStrike().run(),
					active: () => editor?.isActive('strike') ?? false
				},
				{
					type: 'button',
					icon: 'format-clear',
					label: 'Clear Formatting',
					cmd: () => editor?.chain().focus().unsetAllMarks().run(),
					active: () => false
				}
			]
		},
		{
			buttons: [
				{
					type: 'dropdown',
					label: 'Color',
					icon: 'palette',
					items: [
						{
							label: 'Default',
							cmd: () => editor?.chain().focus().unsetColor().run(),
							active: () => !editor?.getAttributes('textStyle').color
						},
						{
							label: 'Custom...',
							cmd: () => colorInput?.click(),
							active: () => editor?.isActive('textStyle', { color: /.*/ }) ?? false
						}
					]
				},
				{
					type: 'dropdown',
					label: 'Font',
					items: [
						{
							label: 'Default',
							cmd: () => editor?.chain().focus().unsetFontFamily().run(),
							active: () => !editor?.getAttributes('textStyle').fontFamily
						},
						{
							label: 'Inter',
							cmd: () => editor?.chain().focus().setFontFamily('Inter').run(),
							active: () => editor?.isActive('textStyle', { fontFamily: 'Inter' }) ?? false
						},
						{
							label: 'Comic Sans',
							cmd: () => editor?.chain().focus().setFontFamily('Comic Sans MS, Comic Sans').run(),
							active: () => editor?.isActive('textStyle', { fontFamily: 'Comic Sans MS, Comic Sans' }) ?? false
						},
						{
							label: 'Serif',
							cmd: () => editor?.chain().focus().setFontFamily('serif').run(),
							active: () => editor?.isActive('textStyle', { fontFamily: 'serif' }) ?? false
						},
						{
							label: 'Monospace',
							cmd: () => editor?.chain().focus().setFontFamily('monospace').run(),
							active: () => editor?.isActive('textStyle', { fontFamily: 'monospace' }) ?? false
						},
						{
							label: 'Cursive',
							cmd: () => editor?.chain().focus().setFontFamily('cursive').run(),
							active: () => editor?.isActive('textStyle', { fontFamily: 'cursive' }) ?? false
						}
					]
				},
				{
					type: 'dropdown',
					label: 'Text',
					items: [
						{ label: 'Paragraph', cmd: () => editor?.chain().focus().setParagraph().run(), active: () => editor?.isActive('paragraph') ?? false },
						{
							label: 'Heading 1',
							cmd: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
							active: () => editor?.isActive('heading', { level: 1 }) ?? false
						},
						{
							label: 'Heading 2',
							cmd: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
							active: () => editor?.isActive('heading', { level: 2 }) ?? false
						},
						{
							label: 'Heading 3',
							cmd: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
							active: () => editor?.isActive('heading', { level: 3 }) ?? false
						}
					]
				}
			]
		},
		{
			buttons: [
				{
					type: 'button',
					icon: 'format-list-bulleted',
					label: 'Bullet List',
					cmd: () => editor?.chain().focus().toggleBulletList().run(),
					active: () => editor?.isActive('bulletList') ?? false
				},
				{
					type: 'button',
					icon: 'format-list-numbered',
					label: 'Numbered List',
					cmd: () => editor?.chain().focus().toggleOrderedList().run(),
					active: () => editor?.isActive('orderedList') ?? false
				}
			]
		},
		{
			buttons: [
				{
					type: 'button',
					icon: 'link',
					label: 'Link',
					cmd: () =>
						editor
							?.chain()
							.focus()
							.setLink({ href: prompt('Enter URL') || '' })
							.run()
				},
				{
					type: 'button',
					icon: 'image',
					label: 'Image',
					cmd: openMediaLibrary
				},
				{
					type: 'button',
					icon: 'youtube',
					label: 'Video',
					cmd: setVideo
				},
				{
					type: 'dropdown',
					icon: 'table',
					label: 'Table'
				},
				{
					type: 'button',
					icon: 'code-tags',
					label: 'Code Block',
					cmd: () => editor?.chain().focus().toggleCodeBlock().run(),
					active: () => editor?.isActive('codeBlock') ?? false
				}
			]
		},
		{
			buttons: [
				{
					type: 'button',
					icon: 'format-align-left',
					label: 'Align Left',
					cmd: () => editor?.chain().focus().setTextAlign('left').run(),
					active: () => editor?.isActive({ textAlign: 'left' }) ?? false
				},
				{
					type: 'button',
					icon: 'format-align-center',
					label: 'Align Center',
					cmd: () => editor?.chain().focus().setTextAlign('center').run(),
					active: () => editor?.isActive({ textAlign: 'center' }) ?? false
				},
				{
					type: 'button',
					icon: 'format-align-right',
					label: 'Align Right',
					cmd: () => editor?.chain().focus().setTextAlign('right').run(),
					active: () => editor?.isActive({ textAlign: 'right' }) ?? false
				},
				{
					type: 'button',
					icon: 'format-quote-close',
					label: 'Blockquote',
					cmd: () => editor?.chain().focus().toggleBlockquote().run(),
					active: () => editor?.isActive('blockquote') ?? false
				}
			]
		},
		{
			condition: () => !!field.aiEnabled,
			buttons: [
				{
					type: 'button',
					icon: 'sparkles',
					label: 'AI Command',
					shortcut: '/',
					cmd: () => {
						showSlashMenu = true;
					}
				}
			]
		},
		{
			buttons: [
				{
					type: 'button',
					icon: 'content-paste',
					label: 'Paste Plain Text',
					cmd: pasteUnformatted
				},
				{
					type: 'button',
					icon: 'xml',
					label: 'Source View',
					cmd: () => (showSource = !showSource),
					active: () => showSource
				}
			]
		}
	];

	function handleScroll() {
		isScrolled = window.scrollY > 120;
	}

	onMount(() => {
		const initialContent = value?.[lang]?.content || '';
		editor = createEditor(element, initialContent, lang, { aiEnabled: !!field.aiEnabled });

		editor.on('update', () => {
			if (!editor) return;
			value = {
				...value,
				[lang]: {
					title: value?.[lang]?.title || '',
					content: editor.isEmpty ? '' : editor.getHTML()
				}
			};
		});

		window.addEventListener('scroll', handleScroll);
		window.addEventListener('click', closeDropdowns);
	});

	onDestroy(() => {
		editor?.destroy();
		window.removeEventListener('scroll', handleScroll);
		window.removeEventListener('click', closeDropdowns);
	});

	$effect(() => {
		const content = value?.[lang]?.content || '';
		if (editor && editor.getHTML() !== content) {
			editor.commands.setContent(content, { emitUpdate: false });
		}
	});
</script>

<div
	class="my-2 relative overflow-hidden rounded border {error
		? 'border-red-500 ring-2 ring-red-500 ring-opacity-50'
		: 'border-surface-200 dark:border-surface-700'} bg-white dark:bg-surface-900 shadow-xl"
>
	<!-- Toolbar -->
	<div
		class="border-b border-surface-200 dark:border-surface-800 bg-surface-50/95 dark:bg-surface-800/95 backdrop-blur-sm px-2 transition-all duration-300 {isScrolled
			? 'fixed inset-x-0 top-0 z-50 shadow-lg'
			: ''}"
	>
		<div class="w-full flex max-w-none flex-wrap items-center gap-1">
			{#each toolbarGroups as group}
				{#if !group.condition || group.condition()}
					<div class="flex items-center gap-1">
						{#each group.buttons as btn}
							{#if btn.type === 'dropdown'}
								<div class="relative">
									<button
										class="flex items-center gap-1 rounded px-2 py-1.5 text-sm font-medium hover:bg-surface-200 dark:hover:bg-white/20 transition {activeDropdown ===
										btn.label
											? 'bg-surface-200 dark:bg-white/20'
											: ''} text-surface-900 dark:text-white"
										onclick={(e) => toggleDropdown(btn.label, e)}
										title={btn.label}
									>
										{#if btn.icon}
											<iconify-icon icon="mdi:{btn.icon}" width="20"></iconify-icon>
										{/if}
										{#if !btn.icon || btn.label !== 'Table'}
											<span class={btn.icon ? 'hidden sm:inline' : ''}>{btn.label}</span>
											<iconify-icon icon="mdi:chevron-down"></iconify-icon>
										{/if}
									</button>
									{#if activeDropdown === btn.label}
										<div
											class="absolute top-full left-0 mt-1 min-w-[180px] rounded-lg border border-surface-200 bg-white p-1 shadow-lg dark:border-surface-700 dark:bg-surface-900 z-50 ring-1 ring-black/5"
										>
											{#if btn.label === 'Table'}
												<div class="p-2 w-48">
													<div class="mb-2 text-xs font-medium text-surface-500 dark:text-surface-400 text-center">
														{hoverRows || 1} x {hoverCols || 1}
													</div>
													<div
														class="grid grid-cols-5 gap-1"
														onmouseleave={() => {
															hoverRows = 0;
															hoverCols = 0;
														}}
														role="grid"
														tabindex="0"
													>
														{#each Array(5) as _, r}
															{#each Array(5) as _, c}
																<button
																	class="w-8 h-8 rounded-sm border transition-colors {r < hoverRows && c < hoverCols
																		? 'bg-blue-100 border-blue-500 dark:bg-blue-500/30 dark:border-blue-400'
																		: 'bg-surface-50 border-surface-200 dark:bg-surface-800 dark:border-surface-700'}"
																	onmouseover={() => {
																		hoverRows = r + 1;
																		hoverCols = c + 1;
																	}}
																	onfocus={() => {
																		hoverRows = r + 1;
																		hoverCols = c + 1;
																	}}
																	onclick={(e) => {
																		e.stopPropagation();
																		editor
																			?.chain()
																			.focus()
																			.insertTable({ rows: r + 1, cols: c + 1, withHeaderRow: true })
																			.run();
																		closeDropdowns();
																	}}
																	aria-label="{r + 1} by {c + 1} table"
																></button>
															{/each}
														{/each}
													</div>
												</div>
											{:else if btn.items}
												{#each btn.items as item}
													<button
														class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-100 dark:hover:bg-white/20 {item.active()
															? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20'
															: 'text-surface-700 dark:text-surface-300'}"
														onclick={(e) => {
															e.stopPropagation();
															item.cmd();
															closeDropdowns();
														}}
													>
														{item.label}
													</button>
												{/each}
											{/if}
										</div>
									{/if}
								</div>
							{:else}
								<button
									class="rounded-lg p-2 hover:bg-surface-100 dark:hover:bg-white/10 transition-all {btn.active?.()
										? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500'
										: 'text-surface-900 dark:text-white'}"
									aria-label={btn.label}
									title={btn.shortcut ? `${btn.label} (${btn.shortcut})` : btn.label}
									onclick={btn.cmd}
								>
									<iconify-icon icon="mdi:{btn.icon}" width="20"></iconify-icon>
								</button>
							{/if}
						{/each}
						<div class="h-5 w-px bg-surface-300 dark:bg-surface-700 mx-1"></div>
					</div>
				{/if}
			{/each}
		</div>
	</div>

	<!-- Editor -->
	<div
		bind:this={element}
		class="prose dark:prose-invert max-w-none px-6 py-4 min-h-96 focus:outline-none leading-relaxed caret-blue-600 dark:caret-blue-400 {showSource
			? 'hidden'
			: ''}"
	>
		<!-- Tiptap content -->
	</div>

	<!-- Token Picker Proxy Input -->
	<!--
		This hidden input receives the focus when the external "Insert Token" button is clicked.
		It triggers the use:tokenTarget action to open the picker.
		The onInsert handler then redirects the inserted token to the actual Tiptap editor.
		This prevents the Token Picker from opening whenever the user just clicks into the editor to type.
	-->
	<input
		type="text"
		id={field.db_fieldName}
		class="sr-only"
		aria-hidden="true"
		tabindex="-1"
		use:tokenTarget={{
			name: field.db_fieldName,
			label: field.label,
			collection: (field as any).collection,
			onInsert: (token: string) => {
				// Insert token into the Tiptap editor at current cursor position
				editor?.chain().focus().insertContent(token).run();
			}
		}}
	/>

	{#if showSource}
		<textarea
			class="w-full min-h-96 p-4 font-mono text-sm bg-surface-50 dark:bg-surface-900 text-surface-900 dark:text-gray-200 border-none resize-y outline-none"
			value={editor?.getHTML() || ''}
			oninput={(e) => {
				const content = (e.target as HTMLTextAreaElement).value;
				editor?.commands.setContent(content, { emitUpdate: true });
			}}
		></textarea>
	{/if}

	<style>
		:global(.ProseMirror) {
			outline: none;
		}
		:global(.ProseMirror p.is-editor-empty:first-child::before) {
			color: #adb5bd;
			content: attr(data-placeholder);
			float: left;
			height: 0;
			pointer-events: none;
		}
		:global(.ProseMirror table) {
			border-collapse: collapse;
			margin: 0;
			overflow: hidden;
			table-layout: fixed;
			width: 100%;
		}
		:global(.ProseMirror td),
		:global(.ProseMirror th) {
			border: 1px solid #ced4da;
			box-sizing: border-box;
			min-width: 1em;
			padding: 6px 8px;
			position: relative;
			vertical-align: top;
		}
		:global(.ProseMirror th) {
			background-color: #f1f3f5;
			font-weight: bold;
			text-align: left;
		}
		/* Dark mode table styles */
		:global(.dark .ProseMirror td),
		:global(.dark .ProseMirror th) {
			border-color: #3f3f46; /* surface-700 */
		}
		:global(.dark .ProseMirror th) {
			background-color: #27272a; /* surface-800 */
		}
	</style>

	<!-- Error -->
	{#if error}
		<div class="border-t border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20 px-8 py-4 text-sm text-red-700 dark:text-red-300">
			{error}
		</div>
	{/if}

	<!-- Slash Menu Modal -->
	{#if showSlashMenu}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			transition:slide={{ duration: 200, easing: quintOut }}
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
			onclick={() => (showSlashMenu = false)}
		>
			<div
				class="w-full max-w-lg rounded-2xl border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-900 p-6 shadow-2xl"
				onclick={(e) => e.stopPropagation()}
			>
				<h3 class="mb-5 text-xl font-semibold text-surface-900 dark:text-white">Command Menu</h3>
				<div class="space-y-2">
					<button
						class="flex w-full items-center gap-4 rounded-xl px-5 py-4 hover:bg-surface-100 dark:hover:bg-surface-700 transition"
						onclick={() => {
							editor?.chain().focus().setHardBreak().run();
							showSlashMenu = false;
						}}
					>
						<iconify-icon icon="mdi:arrow-down-bold" width="22" class="text-surface-600 dark:text-surface-400"></iconify-icon>
						<div class="text-left">
							<div class="font-medium text-surface-900 dark:text-white">Hard Break</div>
							<div class="text-sm text-surface-500 dark:text-surface-400">Insert line break</div>
						</div>
					</button>
					{#if field.aiEnabled}
						<button
							class="flex w-full items-center gap-4 rounded-xl px-5 py-4 hover:bg-surface-100 dark:hover:bg-surface-700 transition"
							onclick={() => {
								editor?.chain().focus().insertContent('/ai ');
								showSlashMenu = false;
							}}
						>
							<iconify-icon icon="mdi:sparkles" width="22" class="text-purple-600"></iconify-icon>
							<div class="text-left">
								<div class="font-medium text-surface-900 dark:text-white">Ask AI</div>
								<div class="text-sm text-surface-500 dark:text-surface-400">Generate or rewrite with AI</div>
							</div>
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<input bind:this={colorInput} type="color" class="hidden" onchange={handleColorChange} />
</div>
