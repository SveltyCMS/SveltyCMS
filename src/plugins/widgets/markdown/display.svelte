<!-- 
@file src/widgets/custom/markdown/display.svelte
@component
**Markdown Display Component**
-->

<script lang="ts">
	import { app } from '@src/stores/store.svelte';
	import type { FieldType } from './index';

	interface Props {
		field: FieldType;
		value: any | null | undefined;
	}

	let { field, value = null }: Props = $props();
	
	const LANGUAGE = $derived(field.translated ? app.contentLanguage : 'en');
	const rawText = $derived(field.translated ? (value?.[LANGUAGE] || '') : (value || ''));

	// Simple MD parser
	function parseMD(md: string) {
		if (!md) return '';
		return md
			.replace(/^# (.*$)/gim, '<h1>$1</h1>')
			.replace(/^## (.*$)/gim, '<h2>$1</h2>')
			.replace(/^### (.*$)/gim, '<h3>$1</h3>')
			.replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
			.replace(/\*(.*)\*/gim, '<em>$1</em>')
			.replace(/!\[(.*?)\]\((.*?)\)/gim, "<img alt='$1' src='$2' />")
			.replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2'>$1</a>")
			.replace(/^\n/gim, '<br />');
	}
</script>

<div class="prose dark:prose-invert max-w-none">
	{@html parseMD(rawText)}
</div>
