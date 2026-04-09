<!--
@file src/widgets/core/rich-text/input.svelte
@component SveltyCMS – Enterprise RichText Editor (2025 Edition)
-->

<script lang="ts">
import { onMount, onDestroy } from "svelte";

// Components
import { tokenTarget } from "@src/services/token/token-target";
import { showModal } from "@utils/modal-utils";

// Stores
import { page } from "$app/state";
import { app } from "@src/stores/store.svelte";
import { collaborationService } from "@src/services/collaboration/collaboration-service.svelte";

// Types
import type { MediaFile } from "../media-upload/types";
import type { FieldType } from "./";
import type { RichTextData } from "./types";

let {
	field,
	value = $bindable(),
	error,
}: {
	field: FieldType;
	value: Record<string, RichTextData> | RichTextData | null | undefined;
	error?: string | null;
} = $props();

const lang = $derived(field.translated ? app.contentLanguage : "default");

// Reactive State
let editor: any | null = $state(null);
let element = $state<HTMLDivElement>();
let isScrolled = $state(false);
let showSource = $state(false);
let activeDropdown = $state<string | null>(null);
let translateLoading = $state(false);
let linkUrl = $state("");

// Initialize Value if empty
$effect(() => {
	if (!value) {
		value = field.translated ? { [lang]: { title: "", content: "" } } : { title: "", content: "" };
	} else if (field.translated && !(value as any)[lang]) {
		value = { ...(value as any), [lang]: { title: "", content: "" } };
	}
});

async function initEditor() {
	if (!element) return;
	
	const { createEditor } = await import("./tiptap");
	const fieldName = field.db_fieldName;
	
	let collabOptions = undefined;
	if (collaborationService.isCollaborative) {
		const yDoc = collaborationService.getYDoc();
		if (yDoc) {
			collabOptions = {
				doc: yDoc,
				field: `rt-${fieldName}-${lang}`, // scoped to field AND language
				awareness: (collaborationService as any).awareness,
				user: {
					name: page.data.user?.name || "Anonymous",
					color: collaborationService.activeUsers.find(u => u.name === page.data.user?.name)?.color || "#3b82f6"
				}
			};
		}
	}

	const initialContent = field.translated 
		? (value as any)?.[lang]?.content || "" 
		: (value as any)?.content || "";

	editor = await createEditor(element, initialContent, lang, {
		aiEnabled: !!field.aiEnabled,
		collaboration: collabOptions,
	});

	editor.on("update", () => {
		const html = editor.isEmpty ? "" : editor.getHTML();
		const newData = { 
			title: field.translated ? (value as any)?.[lang]?.title : (value as any)?.title || "", 
			content: html 
		};

		if (field.translated) {
			value = { ...(value as any), [lang]: newData };
		} else {
			value = newData as any;
		}
	});
}

onMount(() => {
	initEditor();
	const handleScroll = () => (isScrolled = window.scrollY > 120);
	const handleOutsideClick = () => (activeDropdown = null);
	
	window.addEventListener("scroll", handleScroll);
	window.addEventListener("click", handleOutsideClick);

	return () => {
		window.removeEventListener("scroll", handleScroll);
		window.removeEventListener("click", handleOutsideClick);
		editor?.destroy();
	};
});

// Sync external value changes (revert/lang switch) back to editor
$effect(() => {
	const content = field.translated ? (value as any)?.[lang]?.content || "" : (value as any)?.content || "";
	if (editor && editor.getHTML() !== content) {
		editor.commands.setContent(content, { emitUpdate: false });
	}
});

onDestroy(() => editor?.destroy());

// Toolbar Logic
function toggleDropdown(label: string, event: MouseEvent) {
	event.stopPropagation();
	activeDropdown = activeDropdown === label ? null : label;
}

function setLink() {
	if (linkUrl) {
		editor?.chain().focus().setLink({ href: linkUrl }).run();
		activeDropdown = null;
		linkUrl = "";
	}
}

function openMediaLibrary() {
	showModal({
		component: "mediaLibraryModal",
		response: (files: MediaFile[] | undefined) => {
			if (files?.[0]) {
				editor?.chain().focus().setImage({ src: files[0].url, alt: files[0].name }).run();
			}
		},
	});
}

// AI Translation
async function translateContent() {
	const sourceLang = "en";
	const source = (value as any)?.[sourceLang];
	if (!source?.content || sourceLang === lang) return;

	translateLoading = true;
	try {
		const res = await fetch("/api/ai/enrich", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ text: source.content, action: "translate", format: "html", language: lang }),
		});
		const data = await res.json();
		if (data.result) {
			if (field.translated) {
				(value as any)[lang] = { ...(value as any)[lang], content: data.result };
				editor?.commands.setContent(data.result);
			}
		}
	} catch (err) {
		console.error("AI Translate error:", err);
	} finally {
		translateLoading = false;
	}
}
</script>

<div class="my-2 relative overflow-hidden rounded border {error ? 'border-error-500 bg-error-500-10' : 'border-surface-200'} bg-white dark:bg-surface-900">
	<!-- Toolbar (Stick on scroll) -->
	<div class="border-b border-surface-200 dark:border-surface-800 bg-surface-50/95 dark:bg-surface-800/95 backdrop-blur-sm px-2 transition-all duration-300 {isScrolled ? 'fixed inset-x-0 top-0 z-50 shadow-lg' : ''}">
		<div class="w-full flex flex-wrap items-center gap-2 py-1">
			<!-- Toolbar Groups -->
			<div class="btn-group border border-surface-200 dark:border-surface-700 overflow-hidden">
				<button type="button" class="btn-icon preset-tonal" onclick={() => editor?.chain().focus().undo().run()} aria-label="Undo"><iconify-icon icon="mdi:arrow-u-left-top" width="20"></iconify-icon></button>
				<button type="button" class="btn-icon preset-tonal" onclick={() => editor?.chain().focus().redo().run()} aria-label="Redo"><iconify-icon icon="mdi:arrow-u-right-top" width="20"></iconify-icon></button>
			</div>

			<div class="btn-group border border-surface-200 dark:border-surface-700 overflow-hidden">
				<button type="button" class="btn-icon {editor?.isActive('bold') ? 'preset-filled-primary-500' : 'preset-tonal'}" onclick={() => editor?.chain().focus().toggleBold().run()} aria-label="Bold"><iconify-icon icon="mdi:format-bold" width="20"></iconify-icon></button>
				<button type="button" class="btn-icon {editor?.isActive('italic') ? 'preset-filled-primary-500' : 'preset-tonal'}" onclick={() => editor?.chain().focus().toggleItalic().run()} aria-label="Italic"><iconify-icon icon="mdi:format-italic" width="20"></iconify-icon></button>
				<button type="button" class="btn-icon {editor?.isActive('underline') ? 'preset-filled-primary-500' : 'preset-tonal'}" onclick={() => editor?.chain().focus().toggleUnderline().run()} aria-label="Underline"><iconify-icon icon="mdi:format-underlined" width="20"></iconify-icon></button>
			</div>

			<div class="btn-group border border-surface-200 dark:border-surface-700 overflow-hidden">
				<button type="button" class="btn preset-tonal flex items-center gap-2" onclick={(e) => toggleDropdown('Text', e)}>
					<span>{editor?.isActive('heading') ? `H${editor.getAttributes('heading').level}` : 'Paragraph'}</span>
					<iconify-icon icon="mdi:chevron-down" width="14"></iconify-icon>
				</button>
				{#if activeDropdown === 'Text'}
					<div class="absolute top-full left-0 mt-1 min-w-[180px] rounded-lg border border-surface-200 bg-white p-1 shadow-xl dark:bg-surface-800 z-60">
						<button class="flex w-full px-3 py-2 hover:bg-surface-100 dark:hover:bg-surface-700 text-sm" onclick={() => { editor.chain().focus().setParagraph().run(); activeDropdown = null; }}>Paragraph</button>
						<button class="flex w-full px-3 py-2 hover:bg-surface-100 dark:hover:bg-surface-700 text-sm font-bold" onclick={() => { editor.chain().focus().toggleHeading({ level: 1 }).run(); activeDropdown = null; }}>Heading 1</button>
						<button class="flex w-full px-3 py-2 hover:bg-surface-100 dark:hover:bg-surface-700 text-sm font-bold" onclick={() => { editor.chain().focus().toggleHeading({ level: 2 }).run(); activeDropdown = null; }}>Heading 2</button>
					</div>
				{/if}
			</div>

			<div class="btn-group border border-surface-200 dark:border-surface-700 overflow-hidden">
				<button type="button" class="btn-icon preset-tonal" onclick={openMediaLibrary} aria-label="Image"><iconify-icon icon="mdi:image" width="20"></iconify-icon></button>
				<button type="button" class="btn-icon preset-tonal" onclick={(e) => toggleDropdown('Link', e)} aria-label="Link"><iconify-icon icon="mdi:link" width="20"></iconify-icon></button>
				{#if activeDropdown === 'Link'}
					<div class="absolute top-full mt-1 p-3 rounded-lg border bg-white shadow-xl dark:bg-surface-800 z-60 w-64">
						<input type="url" bind:value={linkUrl} placeholder="https://..." class="input input-sm mb-2 w-full" />
						<div class="flex justify-end gap-2"><button class="btn btn-sm" onclick={() => (activeDropdown = null)}>Cancel</button><button class="btn btn-sm variant-filled-primary" onclick={setLink}>Set Link</button></div>
					</div>
				{/if}
			</div>

			<div class="ml-auto flex items-center gap-2">
				{#if field.translated && lang !== "default"}
					<button type="button" class="btn btn-sm preset-tonal flex items-center gap-2" onclick={translateContent} disabled={translateLoading}>
						<iconify-icon icon="mdi:translate" width="18"></iconify-icon>
						{translateLoading ? 'Translating...' : 'AI Translate'}
					</button>
				{/if}
				<button type="button" class="btn-icon {showSource ? 'preset-filled-primary-500' : 'preset-tonal'}" onclick={() => (showSource = !showSource)} aria-label="Source"><iconify-icon icon="mdi:xml" width="20"></iconify-icon></button>
			</div>
		</div>
	</div>

	<!-- Editor Area -->
	<div
		bind:this={element}
		role="textbox"
		tabindex="0"
		class="prose dark:prose-invert max-w-none px-6 py-4 min-h-96 focus:outline-none leading-relaxed cursor-text {showSource ? 'hidden' : ''}"
		onclick={() => editor?.chain().focus().run()}
		onkeydown={(e) => { if (e.key === 'Enter' && e.ctrlKey) editor?.chain().focus().run(); }}
	></div>

	{#if showSource}
		<textarea
			class="w-full min-h-96 p-4 font-mono text-sm bg-surface-50 dark:bg-surface-900 text-surface-900 dark:text-gray-200 border-none resize-y outline-none"
			value={editor?.getHTML() || ''}
			oninput={(e) => editor?.commands.setContent((e.target as HTMLTextAreaElement).value)}
		></textarea>
	{/if}

	<input
		type="text"
		id={field.db_fieldName}
		class="sr-only"
		use:tokenTarget={{
			name: field.db_fieldName,
			onInsert: (token: string) => editor?.chain().focus().insertContent(token).run()
		}}
	/>

	{#if error}
		<div class="border-t border-error-200 bg-error-50 dark:border-error-900 dark:bg-error-900/20 px-8 py-4 text-sm text-error-700 dark:text-error-300">
			{error}
		</div>
	{/if}
</div>

<style>
	:global(.ProseMirror) { height: 100%; outline: none; }
	:global(.ProseMirror p.is-editor-empty:first-child::before) {
		float: left; height: 0; color: #adb5bd; pointer-events: none; content: attr(data-placeholder);
	}
	:global(.dark .ProseMirror) { color: #f9fafb; caret-color: #60a5fa; }
</style>
