<!--
@file src/widgets/custom/markdown/input.svelte
@component
**Split-pane Markdown Editor**
-->

<script lang="ts">
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
			<button type="button" class="px-3 py-1 rounded text-xs font-semibold transition-colors {previewMode === 'edit' ? 'bg-tertiary-500 hover:bg-tertiary-600 dark:bg-primary-500 dark:hover:bg-primary-600 text-white' : 'bg-surface-200 dark:bg-surface-800 text-surface-700 dark:text-surface-300 hover:bg-surface-300 dark:hover:bg-surface-700'}" onclick={() => previewMode = 'edit'}>Edit</button>
			<button type="button" class="px-3 py-1 rounded text-xs font-semibold transition-colors {previewMode === 'split' ? 'bg-tertiary-500 hover:bg-tertiary-600 dark:bg-primary-500 dark:hover:bg-primary-600 text-white' : 'bg-surface-200 dark:bg-surface-800 text-surface-700 dark:text-surface-300 hover:bg-surface-300 dark:hover:bg-surface-700'}" onclick={() => previewMode = 'split'}>Split</button>
			<button type="button" class="px-3 py-1 rounded text-xs font-semibold transition-colors {previewMode === 'preview' ? 'bg-tertiary-500 hover:bg-tertiary-600 dark:bg-primary-500 dark:hover:bg-primary-600 text-white' : 'bg-surface-200 dark:bg-surface-800 text-surface-700 dark:text-surface-300 hover:bg-surface-300 dark:hover:bg-surface-700'}" onclick={() => previewMode = 'preview'}>Preview</button>
		</div>
		<span class="text-[10px] text-surface-400 uppercase font-bold">{LANGUAGE}</span>
	</div>

	<!-- Editor Area -->
	<div class="flex h-100">
		{#if previewMode !== 'preview'}
			<textarea
				aria-label={field.label || field.db_fieldName || 'Markdown editor'}
				class="textarea flex-1 p-4 font-mono text-sm border-none focus:ring-0 bg-transparent resize-none"
				value={rawText}
				oninput={handleInput}
				placeholder="Write markdown here..."
			></textarea>
		{/if}

		{#if previewMode !== 'edit'}
			<div class="flex-1 p-4 overflow-y-auto bg-white dark:bg-surface-900 prose dark:prose-invert max-w-none border-s border-surface-200 dark:border-surface-700">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html parseMD(rawText)}
			</div>
		{/if}
	</div>
</div>
