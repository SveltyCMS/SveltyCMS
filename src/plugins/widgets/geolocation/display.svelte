<!-- 
@file src/widgets/custom/geolocation/display.svelte
@component
**Read-only coordinate display**
-->

<script lang="ts">
	import type { FieldType } from './index';
	import type { GeoPoint } from './types';

	interface Props {
		field: FieldType;
		value: GeoPoint | null | undefined;
	}

	let { value = null }: Props = $props();
</script>

<div class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-300">
	<iconify-icon icon="mdi:map-marker" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
	{#if value && value.coordinates}
		<span class="font-mono">
			{value.coordinates[1].toFixed(6)}, {value.coordinates[0].toFixed(6)}
		</span>
		<a 
			href="https://www.google.com/maps/search/?api=1&query={value.coordinates[1]},{value.coordinates[0]}" 
			target="_blank" 
			class="btn btn-sm variant-soft-primary px-2 py-0 h-6"
		>
			View on Map
		</a>
	{:else}
		<span class="italic text-surface-400">No location set</span>
	{/if}
</div>
