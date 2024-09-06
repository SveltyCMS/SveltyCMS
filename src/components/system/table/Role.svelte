<!-- 
@file src/components/system/table/Role.svelte
@description Role component for table 
-->

<script lang="ts">
	// Auth
	import { getLoadedRoles } from '@src/auth/types';
	let roles = getLoadedRoles() || []; // Ensure roles is an array
	export let value: string;

	// Determine if the roles array is defined and has the required elements
	const roleClasses = (roleId: string) => {
		const role = roles.find((r) => r._id === roleId);
		if (!role) return 'text-white'; // Default class if role not found
		switch (roleId) {
			case roles[0]?._id:
				return 'badge gradient-primary';
			case roles[1]?._id:
				return 'badge gradient-pink';
			case roles[2]?._id:
				return 'badge gradient-tertiary';
			case roles[3]?._id:
				return 'badge gradient-secondary';
			default:
				return 'text-white';
		}
	};

	const iconForRole = (roleId: string) => {
		switch (roleId) {
			case roles[0]?._id:
				return 'material-symbols:verified-outline';
			case roles[1]?._id:
				return 'material-symbols:supervised-user-circle';
			case roles[2]?._id:
				return 'mdi:user-edit';
			case roles[3]?._id:
				return 'material-symbols:supervised-user-circle';
			default:
				return '';
		}
	};

	const roleName = (roleId: string) => roles.find((r) => r._id === roleId)?.name || 'Unknown';
</script>

<div class={roleClasses(value)}>
	{#if iconForRole(value)}
		<iconify-icon icon={iconForRole(value)} width="20" class="mr-2" /> {roleName(value)}
	{:else}
		<span>{roleName(value)}</span>
	{/if}
</div>
