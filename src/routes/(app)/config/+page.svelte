<!-- 
@files src/routes/(app)/config/+page.svelte
@description This file sets up and displays the config page. It provides a user-friendly interface for managing configuration settings. 
-->
<script lang="ts">
	// Component imports
	import PageTitle from '@components/PageTitle.svelte';
	import PermissionGuard from '@components/PermissionGuard.svelte';
	import { page } from '$app/stores'; // Import SvelteKit's page store to access data from the server

	// ParaglideJS imports
	import * as m from '@src/paraglide/messages';

	// Get server-side data
	$: user = $page.data.user; // User information from server
	$: permissions = $page.data.permissions; // Permission data from server
	$: dynamicPermissions = $page.data.allPermissions; // Dynamically loaded permissions

	// Create a mapping from contextId to dynamic permissions for easier access
	$: permissionConfigs = Object.fromEntries(
		dynamicPermissions.map((permission) => [
			permission._id.split(':')[1], // Extract the contextId from permission id (e.g., 'collectionbuilder' from 'config:collectionbuilder')
			{
				contextId: permission._id,
				requiredRole: permission.name, // Assuming `name` holds the required role. Adjust if necessary.
				action: permission.action,
				contextType: permission.type
			}
		])
	);
</script>

<!-- Page Title -->
<div class="my-2 flex items-center justify-between">
	<PageTitle name={m.config_pagetitle()} icon="" />
</div>

<div class="wrapper mb-2 max-h-[calc(100vh-65px)] overflow-auto">
	<h2 class="mb-4 text-center text-tertiary-600 dark:text-primary-500">{m.config_body()}</h2>
	<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
		<!-- Collection -->
		<PermissionGuard config={permissionConfigs.collectionbuilder}>
			<a
				href="/config/collectionbuilder"
				class="config-btn variant-outline-tertiary dark:variant-outline-secondary"
				aria-label={m.config_collectionbuilder()}
			>
				<iconify-icon icon="fluent-mdl2:build-definition" class="config-icon text-tertiary-600" />
				<p class="config-text">{m.config_collectionbuilder()}</p>
			</a>
		</PermissionGuard>

		<!-- Graphql Api -->
		<PermissionGuard config={permissionConfigs.graphql}>
			<a
				href="/api/graphql"
				target="_blank"
				rel="noopener noreferrer"
				class="config-btn variant-outline-tertiary dark:variant-outline-secondary"
				aria-label={m.config_graphql()}
			>
				<iconify-icon icon="teenyicons:graphql-solid" class="config-icon text-warning-600" />
				<p class="config-text">{m.config_graphql()}</p>
			</a>
		</PermissionGuard>

		<!-- Editor -->
		<PermissionGuard config={permissionConfigs.imageeditor}>
			<a href="/imageEditor" class="config-btn variant-outline-tertiary dark:variant-outline-secondary" aria-label={m.config_imageeditor()}>
				<iconify-icon icon="bi:image" class="config-icon text-primary-600" />
				<p class="config-text">{m.config_imageeditor()}</p>
			</a>
		</PermissionGuard>

		<!-- Dashboard -->
		<PermissionGuard config={permissionConfigs.dashboard}>
			<a href="/dashboard" class="config-btn variant-outline-tertiary dark:variant-outline-secondary" aria-label={m.config_Dashboard()}>
				<iconify-icon icon="bi:bar-chart-line" class="config-icon text-error-600" />
				<p class="config-text">{m.config_Dashboard()}</p>
			</a>
		</PermissionGuard>

		<!-- Market Place -->
		<a
			href="https://www.sveltyCMS.com"
			target="_blank"
			rel="noopener noreferrer"
			class="config-btn variant-ghost-primary"
			aria-label={m.config_Martketplace()}
		>
			<iconify-icon icon="icon-park-outline:shopping-bag" class="config-icon text-white" />
			<p class="config-text">{m.config_Martketplace()}</p>
		</a>

		<!-- Widget Management -->
		<PermissionGuard config={permissionConfigs.widgetManagement}>
			<a href="/config/widgetManagement" class="config-btn variant-ghost-primary">
				<iconify-icon icon="mdi:widgets" class="config-icon text-white" />
				<p class="config-text">Widget Management</p>
			</a>
		</PermissionGuard>

		<!-- Theme Management -->
		<PermissionGuard config={permissionConfigs.themeManagement}>
			<a href="/config/themeManagement" class="config-btn variant-ghost-primary">
				<iconify-icon icon="ph:layout" class="config-icon text-white" />
				<p class="config-text">Themes</p>
			</a>
		</PermissionGuard>

		<!-- Settings -->
		<PermissionGuard config={permissionConfigs.settings}>
			<a href="/config/systemsetting" class="config-btn variant-ghost-error" aria-label="System Settings">
				<iconify-icon icon="uil:setting" class="config-icon text-white" />
				<p class="config-text">Settings</p>
			</a>
		</PermissionGuard>

		<!-- Access Management -->
		<PermissionGuard config={permissionConfigs.accessManagement}>
			<a href="/config/assessManagement" class="config-btn variant-ghost-error" aria-label="Access Management">
				<iconify-icon icon="mdi:account-group" class="config-icon text-white" />
				<p class="config-text">Access Management</p>
			</a>
		</PermissionGuard>
	</div>
</div>

<style lang="postcss">
	:global(.config-btn) {
		@apply flex h-24 flex-col items-center justify-center gap-2 p-4 text-center transition-all duration-200 ease-in-out hover:scale-105 lg:h-20;
	}
	:global(.config-icon) {
		@apply text-3xl lg:text-2xl;
	}
	:global(.config-text) {
		@apply w-full truncate text-xs font-medium uppercase lg:text-sm;
	}
</style>
