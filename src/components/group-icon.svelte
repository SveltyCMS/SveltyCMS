<!--
@file src/components/group-icon.svelte
@component Renders a setting group's icon — emoji directly, or an iconify name (mdi:...) via <iconify-icon>.
@props
- `icon` (string): The group.icon value.
- `class` (string): Extra classes (size, spacing, etc.).
-->
<script lang="ts">
	import { cn } from '@utils/cn';

	let { icon, class: className }: { icon: string; class?: string } = $props();

	const isIconify = $derived(/^[a-z0-9-]+:[a-z0-9-]+$/i.test(icon));
</script>

{#if isIconify}
	<iconify-icon icon={icon} class={cn('shrink-0', className)} aria-hidden="true"></iconify-icon>
{:else}
	<span class={cn('shrink-0', className)} aria-hidden="true">{icon}</span>
{/if}
