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
		char?: string | null;
		highlight?: string;
		siteName?: string;
		textClass?: string;
	}

	const { char = null, siteName: propSiteName, highlight, textClass = 'text-black dark:text-white' }: Props = $props();

	// Get site name dynamically from global settings store (updates live!)
	// Fallback chain: prop → live store → default (removed page.data access which causes SSR issues)
	const siteName = $derived(propSiteName || publicEnv?.SITE_NAME || 'SveltyCMS');

	// Split site name into parts if highlight is provided
	const parts = $derived.by(() => {
		if (!(highlight && siteName)) {
			return null;
		}
		const index = siteName.indexOf(highlight);
		if (index === -1) {
			return null;
		}
		return {
			before: siteName.substring(0, index),
			highlight: siteName.substring(index, index + highlight.length),
			after: siteName.substring(index + highlight.length)
		};
	});
</script>

{#if char !== null}
	<!-- Single character mode (for animations) -->
	<span class="text-left font-bold {textClass}"> {char} </span>
{:else if parts}
	<!-- Site name with highlighted portion -->
	<span class="text-left font-bold {textClass}">
		{parts.before}<span class="text-primary-500">{parts.highlight}</span>{parts.after}
	</span>
{:else}
	<!-- Full site name without highlighting -->
	<span class="text-left font-bold {textClass}"> {siteName} </span>
{/if}
