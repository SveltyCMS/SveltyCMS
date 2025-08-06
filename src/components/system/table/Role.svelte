<!--
@file src/components/system/table/Role.svelte
@component
**Role component for displaying different badges based on user roles.**

@example
<Role value={roles[0]?._id} />

### Props
- `value` {string}: The role ID to display

### features
- Dynamic role rendering based on user roles
-->

<script lang="ts">
	// Auth
	import { roles as configRoles, initializeRoles } from '@root/config/roles';
	import type { Role } from '@src/auth/types';

	let roles = $state<Role[]>([]);

	// Ensure roles is an array
	let { value } = $props<{ value: string }>();

	// Initialize roles from config
	$effect(() => {
		initializeRoles().then(() => {
			roles = configRoles;
		});
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
