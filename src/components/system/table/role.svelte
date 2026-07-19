<!--
@file src/components/system/table/role.svelte
@component
**Role component for displaying different badges based on user roles.**

@example
<Role value={roles[0]?._id} />

### Props
- `value` {string}: The role ID to display
- `roles` {Role[]}: Array of role objects to reference for display

### Features
- Dynamic role rendering based on user roles
- Customizable role badges with icons and colors
- Fallback to default role if role ID not found in roles array
-->

<script lang="ts">
	// Using iconify-icon web component
	// Auth
	import Badge from '@components/ui/badge.svelte';
	import type { Role } from '@src/databases/auth/types';

	// Ensure roles is an array
	const { value, roles = [] } = $props();

	const findRole = (roleId: string): Role | undefined => {
		// Exact _id match first
		let role = roles.find((r: Role) => r._id === roleId);
		// Fallback: case-insensitive name match
		if (!role) role = roles.find((r: Role) => r.name?.toLowerCase() === roleId?.toLowerCase());
		// Fallback: partial name match (e.g. "admin" → "Administrator")
		if (!role) role = roles.find((r: Role) => r.name?.toLowerCase().includes(roleId?.toLowerCase()));
		return role;
	};

	const roleVariant = (roleId: string): 'primary' | 'secondary' | 'tertiary' | 'surface' => {
		const role = findRole(roleId);
		const color = role?.color ?? findRole('user')?.color;
		switch (color) {
			case 'gradient-primary':
				return 'primary';
			case 'gradient-pink':
				return 'secondary';
			case 'gradient-tertiary':
				return 'tertiary';
			default:
				return 'surface';
		}
	};

	const iconForRole = (roleId: string) => {
		const role = findRole(roleId);
		if (!role) {
			const defaultRole = findRole('user');
			return defaultRole?.icon || 'material-symbols:person';
		}
		return role.icon || 'material-symbols:person';
	};

	const roleName = (roleId: string) => {
		const role = findRole(roleId);
		if (!role) {
			const defaultRole = findRole('user');
			return defaultRole?.name || 'User';
		}
		return role.name || 'User';
	};
</script>

<Badge variant={roleVariant(value)} class="text-white">
	{#if iconForRole(value)}
		<iconify-icon icon={iconForRole(value)} width="20"></iconify-icon>
		{roleName(value)}
	{:else}
		<span>{roleName(value)}</span>
	{/if}
</Badge>
