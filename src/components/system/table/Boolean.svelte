<!-- 
@file src/components/system/table/Boolean.svelte
@component 
**Boolean component for displaying 'Yes' or 'No' with badges in a table**

@example
<Boolean value={true} />

@props
- `value` {boolean}: The boolean value to display
-->

<script lang="ts">
	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	let { value } = $props<{
		value: boolean; // The boolean value to display
	}>();
</script>

<!-- Display 'Yes' for true and 'No' for false with badges -->
<span class={value ? 'gradient-error badge rounded' : 'gradient-primary badge rounded'}>
	{value ? m.boolean_yes() : m.boolean_no()}
</span>
