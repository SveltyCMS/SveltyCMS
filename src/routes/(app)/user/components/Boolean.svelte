<script lang="ts">
	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// The boolean value to display
	export let value: boolean;
</script>

<!-- Display 'Yes' for true and 'No' for false with badges -->
<span class={value ? 'gradient-error badge rounded' : 'gradient-primary badge rounded'}>
	{value ? m.boolean_yes() : m.boolean_no()}
</span>
