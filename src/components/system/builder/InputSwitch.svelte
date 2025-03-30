<!-- 
@files src/components/system/builder/InputSwitch.svelte
@component
**InputSwitch component is used to render input fields based on provided widget**

@example
<InputSwitch bind:value={value} widget={widget} key={key} bind:iconselected={iconselected} bind:permissions={permissions} />

### Props:
- `value` {any} - Bindable value
- `widget` {any} - Widget component
- `key` {string} - Field key
- `iconselected` {string | null} - Bindable iconselected
- `permissions` {any} - Bindable permissions

### Features:
- Dynamic rendering of input fields based on provided widget
- Accessible checkbox input
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
