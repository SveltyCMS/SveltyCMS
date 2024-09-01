<script lang="ts">
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import { page } from '$app/stores';
	import { authAdapter, initializationPromise } from '@src/databases/db';
	import type { Role } from '@src/auth/types';
	import Loading from '@components/Loading.svelte'; // Import the Loading component

	// Stores to hold roles, loading status, error message, and selected admin role
	const roles = writable<Role[]>([]);
	const isLoading = writable(true);
	const error = writable<string | null>(null);
	const selectedAdminRole = writable<string | null>(null); // Corrected to a writable store

	// Fetch roles on component mount
	onMount(async () => {
		try {
			// await initializationPromise; // Wait for initialization
			await loadRoles(); // Load roles after initialization
		} catch (err) {
			error.set(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			isLoading.set(false); // Set loading to false after loading roles
		}
	});

	// Function to load roles from the authAdapter
	const loadRoles = async () => {
		// if (!authAdapter) {
		// 	error.set('Auth adapter is not initialized');
		// 	return;
		// }
		try {
			// const rolesData = await authAdapter.getAllRoles(); // Fetch all roles
			// roles.set(rolesData);
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
		<h3 class="text-lg font-semibold">Admin Role Management</h3>
		<!-- Existing admin role management UI -->
		<!-- Display selected admin role -->
		<p>Selected Admin Role ID: {$selectedAdminRole}</p>
		<!-- Additional code remains unchanged... -->
	</div>
{/if}
