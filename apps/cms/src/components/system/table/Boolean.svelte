<!-- 
@file src/components/system/table/Boolean.svelte
@component 
**Boolean component for displaying 'Yes' or 'No' with badges in a table**

@example
<Boolean value={true} />

### Props
- `value` {boolean}: The boolean value to display

### Features:
- Displays 'Yes' for true and 'No' for false
- Uses badges with different gradients for visual distinction
-->

<script lang="ts">
	//ParaglideJS
	import * as m from '$lib/paraglide/messages.js';

	// Svelte 5 props
	interface Props {
		value?: boolean;
	}

	const { value = false }: Props = $props();
</script>

<!-- Display 'Yes' for true and 'No' for false with badges -->
<span class={value ? 'gradient-error badge rounded' : 'gradient-primary badge rounded'}>
	{value ? m.boolean_yes() : m.boolean_no()}
</span>
