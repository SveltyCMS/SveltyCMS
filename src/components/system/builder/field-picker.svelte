<!--
@file src/components/system/builder/field-picker.svelte
@description Component for selecting a field from the fields of a selected collection
-->

<script lang="ts">
	import { collections } from '@src/stores/collection-store.svelte';
	import Select from '@components/ui/select.svelte';

	interface Props {
		collection?: string;
		value?: string;
	}

	let { value = $bindable(''), collection = '' }: Props = $props();

	import type { Schema } from '@src/content/types';

	// Get fields for the selected collection
	const selectedCollection = $derived(Object.values((collections as any).all as Record<string, Schema>).find((c) => c.name === collection));
	const fieldNames = $derived(selectedCollection?.fields?.map((f: any) => f.db_fieldName).filter(Boolean) || []);
	const fieldOptions = $derived(fieldNames.map((name: string) => ({ value: name, label: name })));
</script>

<div class="m-1 flex max-w-full items-center justify-between gap-2">
	<Select
		bind:value
		label="Display Field"
		class="grow"
		placeholder="Select a field"
		options={fieldOptions}
		disabled={!collection}
	/>
</div>
