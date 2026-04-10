<!--
 @file src\components\system\slot.svelte
 @component Generic Slot renderer for Injection Zones
-->

<script lang="ts">
	import { slotRegistry } from '@src/plugins/slot-registry';
	import type { InjectionZone } from '@src/plugins/types';

	// We can reuse WidgetLoader or create a simple loader since types definition says component is a promise
	// Actually, WidgetLoader is designed for Widgets with specific props.
	// Let's create a simple internal loader here or use await block.

	interface Props {
		name: InjectionZone;
		props?: Record<string, any>; // Context props passed to the slotted component
	}

	const { name, props = {} }: Props = $props();

	// In a real implementation, this would be reactive to registry changes if we had a comprehensive store.
	// For now, we fetch on mount/reactivity.

	// We need to import slotRegistry in a way that works on client usage if it's isomorphic,
	// but slotRegistry might be populated on client or server?
	// Plugins usually register on startup. If this is client-side, we need to ensure registry is available.
	// Assuming plugins register isomorphic slots.

	const slots = $derived(slotRegistry.getSlots(name));
</script>

<div class="slot-zone" data-zone={name}>
	{#each slots as slot (slot.id)}
		<div class="slot-item mb-4 last:mb-0">
			{#await slot.component()}
				<div class="h-20 w-full animate-pulse rounded bg-surface-100 dark:bg-surface-800"></div>
			{:then Component}
				{#if Component.default}
					<Component.default {...props} {...slot.props} />
				{:else}
					<Component {...props} {...slot.props} />
				{/if}
			{:catch error}
				<div class="rounded border border-error-500/50 bg-error-50 p-2 text-xs text-error-600 dark:bg-error-900/10 dark:text-error-400">
					<strong>Slot Error ({slot.id}):</strong>
					{error.message}
				</div>
			{/await}
		</div>
	{/each}
</div>
