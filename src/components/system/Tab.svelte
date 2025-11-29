<!--
@file src/components/system/Tab.svelte
@description Skeleton v4 compatible Tab component

Individual tab trigger component for use with TabGroup.
-->

<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import type { TabGroupContext } from './TabGroup.svelte';

	interface Props {
		/** Tab value - bound to parent group */
		group?: number | string;
		/** This tab's value */
		value: number | string;
		/** Tab label name */
		name?: string;
		/** Active state classes */
		active?: string;
		/** Hover state classes */
		hover?: string;
		/** Flex alignment */
		flex?: string;
		/** Padding */
		padding?: string;
		/** Border radius */
		rounded?: string;
		/** Additional classes */
		class?: string;
		/** Disabled state */
		disabled?: boolean;
		/** Children slot */
		children?: import('svelte').Snippet;
	}

	let {
		group = $bindable(0),
		value,
		name = '',
		active = 'preset-filled-primary-500',
		hover = 'hover:preset-tonal-primary',
		flex = 'flex-auto',
		padding = 'px-4 py-2',
		rounded = 'rounded-t-container',
		class: className = '',
		disabled = false,
		children
	}: Props = $props();

	const context = getContext<TabGroupContext>('tabGroup');

	onMount(() => {
		context?.registerTab(value);
	});

	// Sync with context if available
	const isActive = $derived(context ? context.group === value : group === value);

	function handleClick() {
		if (disabled) return;
		if (context) {
			context.setGroup(value);
		}
		group = value;
	}
</script>

<button
	type="button"
	role="tab"
	aria-selected={isActive}
	{disabled}
	class="tab {flex} {padding} {rounded} {isActive ? active : hover} {className} transition-colors"
	class:opacity-50={disabled}
	class:cursor-not-allowed={disabled}
	onclick={handleClick}
>
	{#if children}
		{@render children()}
	{:else}
		{name || value}
	{/if}
</button>
