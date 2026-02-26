<!--
@file src/widgets/core/MegaMenu/Display.svelte
@component
**MegaMenu Widget Display Component**

Renders hierarchical menu structures as nested lists with multilingual support.
Part of the Three Pillars Architecture for widget system.

@example
<MegaMenuDisplay value={menuItems} />
Renders: Nested <ul> structure with proper hierarchy and localization

### Props
- `value: MenuItem[] | null | undefined` - Array of menu items to display

### Features
- **Recursive List Rendering**: Self-referencing component for nested menu display
- **Multilingual Display**: Shows menu titles in current content language
- **Semantic HTML**: Uses proper `<ul>` and `<li>` structure for accessibility
- **Language Awareness**: Respects content language store for localization
- **Fallback Handling**: Graceful handling of missing titles and empty menus
- **Clean Styling**: PostCSS styling with proper list indentation
- **Screen Reader Friendly**: Semantic markup for assistive technology
-->

<script lang="ts">
	import { app } from '@src/stores/store.svelte';
	import Sanitize from '@src/utils/Sanitize.svelte';
	import Display from './display.svelte';
	import type { MenuItem } from './types';

	let { value }: { value: MenuItem[] | null | undefined } = $props();
	const lang = $derived(app.contentLanguage);
</script>

{#if value && value.length > 0}
	<ul class="menu-display-list list-none pl-4">
		{#each value as item (item._id)}
			<li>
				<Sanitize html={(item._fields?.title as Record<string, string> | undefined)?.[lang] || 'Untitled'} profile="strict" />
				{#if item.children.length > 0}
					<Display value={item.children} />
				{/if}
			</li>
		{/each}
	</ul>
{:else}
	<span>–</span>
{/if}
