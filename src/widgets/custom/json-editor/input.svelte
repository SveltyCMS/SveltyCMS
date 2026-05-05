<!-- 
@file src/widgets/custom/json-editor/input.svelte
@component
**Premium JSON Editor with syntax validation**
-->

<script lang="ts">
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
		} catch (err: any) {
			parseError = `Invalid JSON: ${err.message}`;
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
		<button 
			type="button" 
			class="btn btn-sm variant-soft-primary text-[10px] h-6 py-0 px-2"
			onclick={formatJson}
			disabled={!!parseError}
		>
			Format JSON
		</button>
	</div>

	<div class="relative rounded-lg overflow-hidden border {parseError ? 'border-error-500' : 'border-surface-400 dark:border-surface-600'}">
		<!-- Line numbers sidebar (Visual only) -->
		<div class="absolute left-0 top-0 bottom-0 w-8 bg-surface-100 dark:bg-surface-800 border-r border-surface-200 dark:border-surface-700 flex flex-col items-center py-3 text-[10px] text-surface-400 select-none pointer-events-none">
			{#each Array(20) as _, i}
				<span>{i + 1}</span>
			{/each}
		</div>

		<textarea
			class="textarea w-full pl-10 pr-4 py-3 font-mono text-sm leading-relaxed bg-surface-50 dark:bg-surface-900 border-none focus:ring-0 resize-y"
			style="height: {field.height || '300px'};"
			value={jsonString}
			oninput={handleInput}
			spellcheck="false"
			placeholder="{`{\"key\": \"value\"}`}"
		></textarea>
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
