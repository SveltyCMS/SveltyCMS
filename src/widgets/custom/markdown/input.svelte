<!--
@file src/widgets/custom/markdown/input.svelte
@component
**Split-pane Markdown Editor**
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Textarea from '@components/ui/textarea.svelte';
	import { app } from '@src/stores/store.svelte';
	import { sanitizeHtml } from '@utils/sanitize-html';
	import type { FieldType } from './index';

	interface Props {
		field: FieldType;
		value: any | null | undefined;
	}

	let { field, value = $bindable(null) }: Props = $props();

	const LANGUAGE = $derived(field.translated ? app.contentLanguage : 'en');

	let rawText = $state('');
	let previewMode = $state<'split' | 'edit' | 'preview'>('split');

	$effect(() => {
		rawText = field.translated ? (value?.[LANGUAGE] || '') : (value || '');
	});

	function handleInput(e: Event) {
		const target = e.target as HTMLTextAreaElement;
		rawText = target.value;

		if (field.translated) {
			if (!value || typeof value !== 'object') value = {};
			value = { ...value, [LANGUAGE]: rawText };
		} else {
			value = rawText;
		}
	}

	// Simple MD parser (Regex-based for demo, replace with 'marked' for production)
	function parseMD(md: string) {
		if (!md) return '';
		const html = md
			.replace(/^# (.*$)/gim, '<h1>$1</h1>')
			.replace(/^## (.*$)/gim, '<h2>$1</h2>')
			.replace(/^### (.*$)/gim, '<h3>$1</h3>')
			.replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
			.replace(/\*(.*)\*/gim, '<em>$1</em>')
			.replace(/!\[(.*?)\]\((.*?)\)/gim, "<img alt='$1' src='$2' />")
			.replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2'>$1</a>")
			.replace(/^\n/gim, '<br />');
		return sanitizeHtml(html);
	}
</script>

<div class="flex flex-col border border-surface-400 dark:border-surface-600 rounded overflow-hidden">
	<!-- Toolbar -->
	<div class="flex items-center justify-between bg-surface-100 dark:bg-surface-800 p-2 border-b border-surface-200 dark:border-surface-700">
		<div class="flex gap-1">
			<Button type="button" size="sm" variant={previewMode === 'edit' ? 'tertiary' : 'surface'} onclick={() => previewMode = 'edit'}>Edit</Button>
			<Button type="button" size="sm" variant={previewMode === 'split' ? 'tertiary' : 'surface'} onclick={() => previewMode = 'split'}>Split</Button>
			<Button type="button" size="sm" variant={previewMode === 'preview' ? 'tertiary' : 'surface'} onclick={() => previewMode = 'preview'}>Preview</Button>
		</div>
		<span class="text-[10px] text-surface-400 uppercase font-bold">{LANGUAGE}</span>
	</div>

	<!-- Editor Area -->
	<div class="flex h-100">
		{#if previewMode !== 'preview'}
			<Textarea
				aria-label={field.label || field.db_fieldName || 'Markdown editor'}
				class="flex-1 space-y-0"
				textareaClass="min-h-0 flex-1 resize-none border-0 bg-transparent p-4 font-mono text-sm shadow-none focus-visible:ring-0"
				value={rawText}
				oninput={handleInput}
				placeholder="Write markdown here..."
			/>
		{/if}

		{#if previewMode !== 'edit'}
			<div class="flex-1 p-4 overflow-y-auto bg-white dark:bg-surface-900 prose dark:prose-invert max-w-none border-s border-surface-200 dark:border-surface-700">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html parseMD(rawText)}
			</div>
		{/if}
	</div>
</div>
