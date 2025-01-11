<!--
@file src/components/system/table/Role.svelte
@component
**Role component for displaying different badges based on user roles.**

```tsx
<Role value={roles[0]?._id} />
```
@props
- `value` {string}: The role ID to display
-->
<script lang="ts">
	// Auth
	import { getLoadedRoles } from '@src/auth/types';
	import { roles as configRoles } from '@root/config/roles';

	let roles = $state(getLoadedRoles() || configRoles);

	// Ensure roles is an array
	let { value } = $props<{ value: string }>();

	// Initialize roles from config if not loaded
	$effect(() => {
		const loadedRoles = getLoadedRoles();
		if (!loadedRoles || loadedRoles.length === 0) {
			roles = configRoles;
		} else {
			roles = loadedRoles;
		}
	});

	// Determine if the roles array is defined and has the required elements
	const roleClasses = (roleId: string) => {
		const role = roles.find((r) => r._id === roleId);
		if (!role) {
			const defaultRole = configRoles.find((r) => r._id === 'user');
			return defaultRole?.color || 'text-white';
		}
		return role.color || 'text-white';
	};

	const iconForRole = (roleId: string) => {
		const role = roles.find((r) => r._id === roleId);
		if (!role) {
			const defaultRole = configRoles.find((r) => r._id === 'user');
			return defaultRole?.icon || 'material-symbols:person';
		}
		return role.icon || 'material-symbols:person';
	};

	const roleName = (roleId: string) => {
		const role = roles.find((r) => r._id === roleId);
		if (!role) {
			const defaultRole = configRoles.find((r) => r._id === 'user');
			return defaultRole?.name || 'User';
		}
		return role.name || 'User';
	};
</script>

<span class="badge {roleClasses(value)}">
	{#if iconForRole(value)}
		<iconify-icon icon={iconForRole(value)} width="20"></iconify-icon> {roleName(value)}
	{:else}
		<span>{roleName(value)}</span>
	{/if}
</span>
