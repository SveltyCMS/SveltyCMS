<!-- 
@file src/components/system/table/boolean.svelte
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
	import Badge from '@components/ui/badge.svelte';
	import { boolean_no, boolean_yes } from '@src/paraglide/messages';

	// Svelte 5 props
	interface Props {
		value?: boolean;
	}

	const { value = false }: Props = $props();
</script>

<!-- Display 'Yes' for true and 'No' for false with badges -->
<Badge variant={value ? 'error' : 'primary'} rounded={false}>{value ? boolean_yes() : boolean_no()}</Badge>
