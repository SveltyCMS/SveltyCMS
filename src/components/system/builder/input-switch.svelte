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

	// Function to update the parent component (so Field Inspector → setCollection gets label, db_fieldName, icon, etc.)
	function updateParent() {
		if (props.onupdate) {
			props.onupdate({ value, icon });
		}
	}

	// Many admin inputs (e.g. Input.svelte) only use bind:value and never dispatch 'update'.
	// IconifyIconsPicker updates bind:icon; we must pass both so icon changes persist. Only sync when
	// value or icon actually changed to avoid effect_update_depth_exceeded.
	const lastReported = { value: undefined as unknown, icon: undefined as unknown };
	$effect(() => {
		const v = value;
		const i = icon;
		if (v === lastReported.value && i === lastReported.icon) return;
		lastReported.value = v;
		lastReported.icon = i;
		updateParent();
	});

	import { resolveAdminComponent } from '@src/components/system/admin-component-registry';

	const WidgetComponent = $derived(resolveAdminComponent(props.widget));
</script>

{#if WidgetComponent}
	<WidgetComponent bind:value bind:icon bind:permissions on:update={updateParent} label={props.key} theme="dark" />
{/if}
