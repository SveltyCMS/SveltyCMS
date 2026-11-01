<!--
@file tests/unit/components/dom/mocks/mock-fields-view.svelte
@component
Test stub for `fields.svelte`: exposes the live form store as JSON so page-level
tests can assert what a draft resume / autosave did to the form without mounting
every widget.

@props — none (the real component's props are accepted and ignored).
-->

<script lang="ts">
	import { collections } from '@src/stores/collection-store.svelte';

	const snapshot = $derived(JSON.stringify(collections.activeValue ?? {}));
</script>

<div data-testid="fields-stub" data-value={snapshot}>{snapshot}</div>
