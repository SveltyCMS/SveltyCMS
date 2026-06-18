<!--
@file src/widgets/custom/json-editor/input.svelte
@component
**Premium JSON Editor with syntax validation**
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Textarea from '@components/ui/textarea.svelte';
	import { validationStore } from '@src/stores/store.svelte';
	import { getFieldName } from '@src/utils/utils';
	import type { FieldType } from './index';

	interface Props {
		field: FieldType;
		value: any | null | undefined;
	}

	let { field, value = $bindable(null) }: Props = $props();

	let jsonString = $state(value ? JSON.stringify(value, null, 2) : '');
	let parseError = $state<string | null>(null);
	const fieldName = $derived(getFieldName(field));

	function handleInput(e: Event) {
		const target = e.target as HTMLTextAreaElement;
		jsonString = target.value;

		try {
			if (!jsonString.trim()) {
				value = null;
				parseError = null;
			} else {
				value = JSON.parse(jsonString);
				parseError = null;
			}
			validationStore.setError(fieldName, '');
		} catch (err: unknown) {
			parseError = `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`;
			validationStore.setError(fieldName, parseError);
		}
	}

	// Format button
	function formatJson() {
		try {
			if (jsonString.trim()) {
				const obj = JSON.parse(jsonString);
				jsonString = JSON.stringify(obj, null, 2);
				value = obj;
			}
		} catch (err) {}
	}
</script>

<div class="relative group">
	<div class="flex items-center justify-between mb-2 px-1">
		<span class="text-[10px] uppercase tracking-widest text-surface-400 font-bold">JSON Data</span>
		<Button
			variant="tertiary"
			size="sm"
			type="button"
			onclick={formatJson}
			disabled={!!parseError}
		>
			Format JSON
		</Button>
	</div>

	<div class="relative rounded overflow-hidden border {parseError ? 'border-error-500' : 'border-surface-400 dark:border-surface-600'}">
		<!-- Line numbers sidebar (Visual only) -->
		<div class="absolute inset-s-0 top-0 bottom-0 w-8 bg-surface-100 dark:bg-surface-800 border-e border-surface-200 dark:border-surface-700 flex flex-col items-center py-3 text-[10px] text-surface-400 select-none pointer-events-none">
			{#each Array(20) as _, i}
				<span>{i + 1}</span>
			{/each}
		</div>

		<Textarea
			aria-label={field.label || fieldName || 'JSON editor'}
			class="w-full space-y-0"
			textareaClass="w-full resize-y border-0 bg-surface-50 ps-10 pe-4 py-3 font-mono text-sm leading-relaxed shadow-none focus-visible:ring-0 dark:bg-surface-900 [tab-size:2]"
			style="height: {field.height || '300px'};"
			value={jsonString}
			oninput={handleInput}
			spellcheck={false}
			placeholder="{`{\"key\": \"value\"}`}"
		/>
	</div>

	{#if parseError}
		<p class="mt-1 text-xs text-error-500 flex items-center gap-1">
			<iconify-icon icon="mdi:alert-circle"></iconify-icon>
			{parseError}
		</p>
	{/if}
</div>

<style>
	textarea {
		tab-size: 2;
	}
</style>
