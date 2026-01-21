<!--
@file src/components/system/table/Role.svelte
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
	import Icon from '@iconify/svelte';
	// Auth
	import type { Role } from '@src/databases/auth/types';

	// Ensure roles is an array
	const { value, roles = [] } = $props();

	const roleClasses = (roleId: string) => {
		const role = roles.find((r: Role) => r._id === roleId);
		if (!role) {
			const defaultRole = roles.find((r: Role) => r._id === 'user');
			return defaultRole?.color || 'text-white';
		}
		return role.color || 'text-white';
	};

	const iconForRole = (roleId: string) => {
		const role = roles.find((r: Role) => r._id === roleId);
		if (!role) {
			const defaultRole = roles.find((r: Role) => r._id === 'user');
			return defaultRole?.icon || 'material-symbols:person';
		}
		return role.icon || 'material-symbols:person';
	};

	const roleName = (roleId: string) => {
		const role = roles.find((r: Role) => r._id === roleId);
		if (!role) {
			const defaultRole = roles.find((r: Role) => r._id === 'user');
			return defaultRole?.name || 'User';
		}
		return role.name || 'User';
	};
</script>

<span class="badge {roleClasses(value)}">
	{#if iconForRole(value)}
		{#if iconsData[iconForRole(value) as keyof typeof iconsData] as any}<Icon
				icon={iconsData[iconForRole(value) as keyof typeof iconsData] as any}
				size={20}
			/>{/if}
		{roleName(value)}
	{:else}
		<span>{roleName(value)}</span>
	{/if}
</span>
