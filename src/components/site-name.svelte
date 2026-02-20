<!-- 
@file src/components/site-name.svelte
@component
**Site name component with optional highlighting**

### Features
- Displays site name with optional highlighting
- Supports both dark and light mode
- Accessibility features for screen readers

### Usage
```svelte
<SiteName siteName="My Site" highlight="Site" />
```

### Props
- `siteName` (string): The site name
- `highlight` (string, optional): Text to highlight
- `textClass` (string, optional): Additional text classes

### Computed Properties
- `parts`: Derived parts of the site name for highlighting

### Stores
- None

### Types
- `Props`: Props type

### Example
<script lang="ts">
	import SiteName from './site-name.svelte';
</script>

<SiteName siteName="My Site" highlight="Site" />

-->

<script lang="ts">
	import { publicEnv } from '@src/stores/global-settings.svelte';

	interface Props {
		highlight?: string;
		siteName?: string;
		textClass?: string;
		char?: string;
	}

	const { siteName = '', highlight = '', textClass = '', char = '' }: Props = $props();

	// Use siteName prop if provided, else fall back to global store
	const activeName = $derived(char || siteName || publicEnv.SITE_NAME || 'SveltyCMS');

	// Derived logic to split site name for highlighting
	const parts = $derived.by(() => {
		if (!highlight || !activeName) {
			return null;
		}
		const index = activeName.toLowerCase().indexOf(highlight.toLowerCase());
		if (index === -1) {
			return null;
		}

		return {
			before: activeName.slice(0, index),
			highlight: activeName.slice(index, index + highlight.length),
			after: activeName.slice(index + highlight.length)
		};
	});
</script>

{#if parts}
	<span class="text-left font-bold {textClass}">
		{parts.before}<span class="text-primary-500">{parts.highlight}</span>{parts.after}
	</span>
{:else}
	<span class="text-left font-bold {textClass}">{activeName}</span>
{/if}
