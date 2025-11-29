<!--
@file src/components/system/TabsCompat.svelte
@description Skeleton v4 compatible Tabs component with v2-like API

This wraps the new compound Tabs component from Skeleton v4.

Usage (old v2 style):
```svelte
<script>
  import { TabGroup, Tab } from '@components/system/TabsCompat.svelte';
  let activeTab = 0;
</script>

<TabGroup>
  <Tab bind:group={activeTab} value={0}>Tab 1</Tab>
  <Tab bind:group={activeTab} value={1}>Tab 2</Tab>
</TabGroup>

{#if activeTab === 0}
  <div>Content 1</div>
{:else}
  <div>Content 2</div>
{/if}
```

Recommended v4 style (use directly from skeleton-svelte):
```svelte
<script>
  import { Tabs } from '@skeletonlabs/skeleton-svelte';
</script>

<Tabs.Root value="tab1">
  <Tabs.List>
    <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
    <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="tab1">Content 1</Tabs.Content>
  <Tabs.Content value="tab2">Content 2</Tabs.Content>
</Tabs.Root>
```
-->

<script lang="ts" module>
	export interface TabGroupContext {
		registerTab: (value: number | string) => void;
		group: number | string;
		setGroup: (value: number | string) => void;
	}
</script>

<script lang="ts">
	import { setContext } from 'svelte';

	interface Props {
		/** Active tab value for binding */
		active?: number | string;
		/** Justify content */
		justify?: 'justify-start' | 'justify-center' | 'justify-end' | 'justify-between';
		/** Border styles */
		border?: string;
		/** Additional classes */
		class?: string;
		/** Children slot */
		children?: import('svelte').Snippet;
	}

	let {
		active = $bindable(0),
		justify = 'justify-start',
		border = 'border-b border-surface-400-500-token',
		class: className = '',
		children
	}: Props = $props();

	const tabs = $state<(number | string)[]>([]);

	setContext<TabGroupContext>('tabGroup', {
		registerTab: (value: number | string) => {
			if (!tabs.includes(value)) {
				tabs.push(value);
			}
		},
		get group() {
			return active;
		},
		setGroup: (value: number | string) => {
			active = value;
		}
	});
</script>

<div class="tab-group {className}">
	<div class="tab-list flex {justify} {border}">
		{@render children?.()}
	</div>
</div>
