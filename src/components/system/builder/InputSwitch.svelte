<!-- 
@files src/components/system/builder/InputSwitch.svelte
@description InputSwitch component
-->

<script lang="ts">
	import { sanitizePermissions } from '@src/auth/types';

	// Define props using $props()
	const props = $props<{
		value: any;
		widget: any; // Consider using a more specific type if possible
		key: string;
		iconselected?: string | null;
		permissions?: any;
	}>();

	// Create state variables for mutable props
	let value = $state(props.value ?? null);
	let iconselected = $state(props.iconselected ?? null);
	let permissions = $state(props.permissions ?? null);

	// Use $effect for side effects
	$effect(() => {
		if (props.key === 'display' && value?.default === true) {
			value = '';
		}
	});

	$effect(() => {
		if (props.key === 'permissions' && value) {
			permissions = sanitizePermissions(value);
		}
	});

	// Update local state when props change
	$effect(() => {
		value = props.value ?? null;
		iconselected = props.iconselected ?? null;
		permissions = props.permissions ?? null;
	});

	// Function to update the parent component
	function updateParent() {
		dispatchEvent(
			new CustomEvent('update', {
				detail: { value, iconselected, permissions }
			})
		);
	}
</script>

{#if props.widget}
	<props.widget bind:value bind:iconselected bind:permissions on:update={updateParent} on:toggle label={props.key} theme="dark" />
{/if}
