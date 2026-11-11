<!--
@file src/widgets/core/many-to-many/input.svelte
@component
**ManyToMany Widget Input Component**

The selection UI is identical to the Relation widget (modal picker, multi-select,
clear). The difference is persistence: the server stores one junction row per
edge instead of an id array inside the document. Reusing the Relation input keeps
one implementation of the picker (search, preview, locale-aware labels).

@props
- `field: FieldType` — ManyToMany field definition (`collection`, `displayField`)
- `value: string | string[] | null | undefined` — selected ids (bindable)
- `error?: string | null` — validation message

### Features
- Reuses the core Relation picker (no duplicated modal logic)
- Array value matches the `multiple: true` contract of the junction widget
- Bindable `value` so the form writes selections back to the entry
-->

<script lang="ts">
	import RelationInput from '../relation/input.svelte';
	import type { FieldType as RelationFieldType } from '../relation';
	import type { FieldType } from './';

	let {
		field,
		value = $bindable(),
		error
	}: {
		field: FieldType;
		value: string | string[] | null | undefined;
		error?: string | null;
	} = $props();

	// The picker only reads `collection` / `displayField` / `multiple`, which the
	// ManyToMany field carries (multiple is always true).
	const relationField = $derived(field as unknown as RelationFieldType);
</script>

<RelationInput field={relationField} bind:value {error} />
