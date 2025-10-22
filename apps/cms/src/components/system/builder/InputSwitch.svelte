<!-- 
@files src/components/system/builder/InputSwitch.svelte
@component
**InputSwitch component**

Features:
- Dynamic rendering of input fields based on provided widget

-->

<script lang="ts">
	// sanitizePermissions function moved to component - simplified implementation
	function sanitizePermissions(permissions: Record<string, Record<string, boolean>>) {
		const res = Object.entries(permissions).reduce(
			(acc, [role, actions]) => {
				const nonEmptyActions = Object.entries(actions).reduce(
					(actionAcc, [action, value]) => {
						if (value !== false) {
							actionAcc[action] = value;
						}
						return actionAcc;
					},
					{} as Record<string, boolean>
				);
				if (Object.keys(nonEmptyActions).length > 0) {
					acc[role] = nonEmptyActions;
				}
				return acc;
			},
			{} as Record<string, Record<string, boolean>>
		);
		return Object.keys(res).length === 0 ? undefined : res;
	}
	import { createEventDispatcher } from 'svelte';
	// Define props using $props()
	const props = $props<{
		value: any;
		widget: any;
		key: string;
		icon?: string | null;
		permissions?: any;
	}>();

	const dispatch = createEventDispatcher();

	// Create state variables for mutable props
	let value = $state(props.value ?? null);
	let icon = $state(props.icon ?? null);
	let permissions = $state(props.permissions ?? null);

	// Use $effect for side effects
	$effect(() => {
		if (props.key === 'display' && value?.default === true) {
			value = '';
		}

		// Only update the parent component if the value has changed
		if (value !== props.value) {
			updateParent();
		}
	});

	$effect(() => {
		if (props.key === 'permissions' && value) {
			permissions = sanitizePermissions(value);

			// Only update the parent component if the permissions have changed
			if (permissions !== props.permissions) {
				updateParent();
			}
		}
	});

	// Function to update the parent component
	function updateParent() {
		dispatch('update', { value });
	}
</script>

{#if props.widget}
	<props.widget bind:value bind:icon bind:permissions on:update={updateParent} label={props.key} theme="dark" />
{/if}
