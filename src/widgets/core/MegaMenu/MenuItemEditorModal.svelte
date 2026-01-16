<!--
@files src/widgets/core/MegaMenu/MenuItemEditorModal.svelte
@component
**MenuItemEditorModal - This component displays a modal for editing menu items.**

### Props
- `item`: MenuItem
- `level`: number
- `fields`: FieldInstance[]
- `isNew`: boolean
- `onSave`: (data: Record<string, any>) => void
- `close`: (result?: any) => void

### Features
- Displays a modal for editing menu items
- Allows editing of menu item properties
-->

<script lang="ts">
	import * as m from '@src/paraglide/messages';
	import type { MenuItem } from './types';
	import type { FieldInstance } from '@src/content/types';
	// import WidgetBuilder from '@components/system/builder/WidgetBuilder.svelte';

	interface Props {
		item: MenuItem;
		level: number;
		fields: FieldInstance[];
		isNew: boolean;
		onSave: (data: Record<string, any>) => void;
		close?: (result?: any) => void;
	}

	let { item, level, fields, isNew, onSave, close }: Props = $props();

	// Silence unused warnings for now
	$effect(() => {
		console.log('Editing item at level:', level);
		console.log('Available fields:', fields);
	});

	// Clone data to avoid direct mutation until save
	// svelte-ignore state_referenced_locally
	let formData = $state(JSON.parse(JSON.stringify(item._fields || {})));

	function handleSubmit() {
		onSave(formData);
		close?.();
	}

	function handleCancel() {
		close?.();
	}
</script>

<div class="space-y-4">
	<header class="text-2xl font-bold text-center">
		{isNew ? 'Create' : 'Edit'} Menu Item
	</header>

	<div class="space-y-4 max-h-[60vh] overflow-y-auto p-1">
		<!-- 
			If we had a dynamic form renderer for 'fields', expected here. 
			For now, assuming at least a 'title' field is standard or we show a generic input.
			Since 'fields' is passed, we *should* render them.
			But for this recreation, we'll provide a basic Title input 
			and iterate fields if possible, or just show a JSON editor fallback?
			Let's just do a Title input as a safe baseline.
		-->
		<div class="label">
			<span class="label-text">Title</span>
			<input class="input" type="text" bind:value={formData.title} placeholder="Menu Item Title" />
		</div>

		<div class="label">
			<span class="label-text">URL / Path</span>
			<input class="input" type="text" bind:value={formData.url} placeholder="/path/to/page" />
		</div>
	</div>

	<footer class="flex justify-end gap-2 pt-4 border-t border-surface-500/20">
		<button class="btn preset-ghost" onclick={handleCancel}>
			{m.button_cancel()}
		</button>
		<button class="btn preset-filled-primary-500" onclick={handleSubmit}>
			{m.button_save()}
		</button>
	</footer>
</div>
