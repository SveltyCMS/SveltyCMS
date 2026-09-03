<!--
@file src/widgets/custom/markdown/display.svelte
@component
**Markdown Display Component**
-->

	<script lang="ts">
		import { app } from '@src/stores/store.svelte';
		import { parseMarkdown } from './parse-markdown';
		import type { FieldType } from './index';

	interface Props {
		field: FieldType;
		value: any | null | undefined;
	}

	let { field, value = null }: Props = $props();

	const LANGUAGE = $derived(field.translated ? app.contentLanguage : 'en');
	const rawText = $derived(field.translated ? (value?.[LANGUAGE] || '') : (value || ''));
</script>

	<div class="prose dark:prose-invert max-w-none">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html parseMarkdown(rawText)}
</div>
