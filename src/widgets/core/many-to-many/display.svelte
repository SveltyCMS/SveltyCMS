<!--
@file src/widgets/core/many-to-many/display.svelte
@component
**ManyToMany Widget Display Component**

Read-only rendering for junction relations. The read path hydrates the field back
to an ordered id array, so the Relation display (badges / joined labels) renders
it unchanged.

@props
- `field: FieldType` — ManyToMany field definition
- `value: string | string[] | null | undefined` — hydrated target ids

### Features
- Reuses the Relation display (label resolution + lazy hydration)
- Handles an empty or missing relation without an extra request
-->

<script lang="ts">
	import RelationDisplay from '../relation/display.svelte';
	import type { FieldType as RelationFieldType } from '../relation';
	import type { FieldType } from './';

	const {
		field,
		value
	}: {
		field: FieldType;
		value: string | string[] | null | undefined;
	} = $props();

	const relationField = $derived(field as unknown as RelationFieldType);
</script>

<RelationDisplay field={relationField} {value} />
