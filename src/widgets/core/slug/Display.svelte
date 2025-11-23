<!--
@file src/widgets/core/slug/Display.svelte
@component
**Slug Display Component**

Displays the slug value in lists and tables.
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { contentLanguage } from '@src/stores/store.svelte';
	import { publicEnv } from '@src/stores/globalSettings.svelte';

	interface Props {
		field: FieldType;
		value?: Record<string, string> | null | undefined;
		contentLanguage?: string;
	}

	let { field, value, contentLanguage: propContentLanguage }: Props = $props();

	const _language = $derived(
		field.translated
			? (propContentLanguage || contentLanguage.value)
			: ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase()
	);

	const displayValue = $derived(value?.[_language] || '');
</script>

<span class="font-mono text-sm text-primary-400">{displayValue || '—'}</span>

