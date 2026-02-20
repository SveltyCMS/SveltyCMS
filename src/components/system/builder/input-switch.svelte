<!-- 
@files src/components/system/builder/input-switch.svelte
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
	// Props from parent
	let { value = $bindable(null), icon = $bindable(null), permissions = $bindable(null), ...props } = $props();

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

	// Function to update the parent component
	function updateParent() {
		if (props.onupdate) {
			props.onupdate({ value });
		}
	}

	import { resolveAdminComponent } from '@src/components/system/admin-component-registry';

	const WidgetComponent = $derived(resolveAdminComponent(props.widget));
</script>

{#if WidgetComponent}
	<WidgetComponent bind:value bind:icon bind:permissions on:update={updateParent} label={props.key} theme="dark" />
{/if}
