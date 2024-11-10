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
	let roles = $state(getLoadedRoles() || []);

	// Ensure roles is an array
	let { value } = $props<{ value: string }>();

	// Determine if the roles array is defined and has the required elements
	const roleClasses = (roleId: string) => {
		const role = roles.find((r) => r._id === roleId);
		if (!role) return 'text-white';
		// Default class if role not found
		return role.color || 'text-white';
		// Use color defined in the role
	};
	const iconForRole = (roleId: string) => {
		const role = roles.find((r) => r._id === roleId);
		if (!role) return '';
		// Return empty if role not found
		return role.icon || '';
		// Use icon defined in the role
	};
	const roleName = (roleId: string) => {
		const role = roles.find((r) => r._id === roleId);
		if (!role) return 'Unknown';
		return role.name || 'Unknown';
	};
</script>

<div class={roleClasses(value)}>
	{#if iconForRole(value)}
		<iconify-icon icon={iconForRole(value)} width="20" class="mr-2"></iconify-icon> {roleName(value)}
	{:else}
		<span>{roleName(value)}</span>
	{/if}
</div>
