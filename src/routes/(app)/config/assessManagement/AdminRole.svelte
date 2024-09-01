<script lang="ts">
	import { onMount } from 'svelte';

	// Stores
	import { page } from '$app/stores';
	import { writable } from 'svelte/store';

	// Auth
	import type { Role } from '@src/auth/types';

	// Components
	import Loading from '@components/Loading.svelte';

	const roles = writable<Role[]>([]);
	const isLoading = writable(true);
	const error = writable<string | null>(null);
	const selectedAdminRole = writable<string | null>(null);

	// Fetch roles on component mount
	onMount(async () => {
		try {
			await loadRoles(); // Load roles after initialization
		} catch (err) {
			error.set(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			isLoading.set(false); // Set loading to false after loading roles
		}
	});

	// Function to load roles from the authAdapter
	const loadRoles = async () => {
		try {
			const rolesData = $page.data.roles;
			roles.set(rolesData);

			// Set the current admin role if it exists
			const currentAdmin = rolesData.find((role) => role._id.toLowerCase() === 'admin');
			if (currentAdmin) {
				selectedAdminRole.set(currentAdmin._id); // Correctly set the selected admin role
			}
		} catch (err) {
			error.set(`Failed to load roles: ${err instanceof Error ? err.message : String(err)}`);
		}
	};
</script>

{#if $isLoading}
	<Loading customTopText="Loading Admin Role..." customBottomText="Please wait while the admin role is being loaded." />
{:else if $error}
	<p class="error">{$error}</p>
{:else}
	<div class="my-4">
		<h2 class="text-lg font-semibold">Admin Role Management</h2>

		<!-- Display selected admin role -->
		<p>Selected Admin Role ID: <span class="ml-2 text-tertiary-500 dark:text-primary-500">{$selectedAdminRole}</span></p>
		<!-- Additional code remains unchanged... -->
	</div>
{/if}
