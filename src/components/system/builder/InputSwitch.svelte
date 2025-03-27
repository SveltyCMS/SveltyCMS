<!-- 
@files src/components/system/builder/InputSwitch.svelte
@component
**InputSwitch component**

Features:
- Dynamic rendering of input fields based on provided widget
-->

<script lang="ts">
	// Define props using $props()
	let {
		value = $bindable(), // Make value bindable
		widget,
		key,
		iconselected = $bindable(), // Make iconselected bindable
		permissions = $bindable() // Make permissions bindable
	} = $props<{
		value: any; // bindable
		widget: any;
		key: string;
		iconselected?: string | null; // bindable
		permissions?: any; // bindable
	}>();
</script>

{#if widget}
	<widget {value} {iconselected} {permissions} ontoggle={(event: Event) => dispatchEvent(event)} label={key} theme="dark"></widget>
{/if}
