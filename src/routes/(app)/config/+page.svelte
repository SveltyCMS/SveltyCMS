<!-- 
@files src/routes/(app)/config/+page.svelte
@component
**This file sets up and displays the config page. It provides a user-friendly interface for managing configuration settings**

Features:
- Collection builder
- GraphQL API
- Image editor
- Dashboard
- Market Place
- Widget Management
- Theme Management
- Settings
- Access Management
-->

<script lang="ts">
	// Stores
	import { page } from '$app/state';

	// Component
	import PageTitle from '@components/PageTitle.svelte';
	import PermissionGuard from '@components/PermissionGuard.svelte';

	// ParaglideJS imports
	import * as m from '@src/paraglide/messages';

	// Import PermissionConfig type from the correct file
	import type { PermissionConfig } from '@src/auth/permissionCheck';
	import { onMount } from 'svelte';
	import { collection } from '@src/stores/collectionStore.svelte';
	//import type { Schema } from '@src/content/ContentManager';

	// Define the structure of dynamicPermissions
	type DynamicPermissions = Record<string, PermissionConfig>;

	// Get server-side data
	let dynamicPermissions = $derived(page.data.permissionConfigs as DynamicPermissions); // Dynamically loaded permissions

	onMount(() => {
		collection.set(null);
	});

	// Create a mapping from contextId to dynamic permissions for easier access
	let permissionConfigs = $derived(
		Object.fromEntries(
			Object.values(dynamicPermissions).map((permission) => [
				permission.contextId.split('/')[1], // Extract the contextId from permission id (e.g., 'collectionbuilder' from 'config:collectionbuilder')
				{
					contextId: permission.contextId,
					name: permission.name, // Ensure the `name` property is included
					action: permission.action,
					contextType: permission.contextType // Ensure this matches the expected type
				}
			])
		) as Record<string, PermissionConfig>
	);
</script>

<!-- Page Title with Back Button -->
<PageTitle name={m.config_pagetitle()} showBackButton={true} icon="material-symbols:build-circle" />

<div class="wrapper mb-2 max-h-[calc(100vh-65px)] overflow-auto">
	<h2 class="text-tertiary-600 dark:text-primary-500 mb-4 text-center">{m.config_body()}</h2>
	<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
		<!-- Collection -->
		<PermissionGuard config={permissionConfigs.collectionbuilder}>
			<a href="/config/collectionbuilder" class="btn preset-outline-tertiary dark:preset-outline-secondary" aria-label={m.config_collectionbuilder()}>
				<iconify-icon icon="fluent-mdl2:build-definition" class="text-tertiary-600 text-3xl lg:text-2xl"></iconify-icon>
				<p class="w-full truncate text-xs font-medium uppercase lg:text-sm">{m.config_collectionbuilder()}</p>
			</a>
		</PermissionGuard>

		<!-- Graphql Api -->
		<PermissionGuard config={permissionConfigs.graphql}>
			<a
				href="/api/graphql"
				target="_blank"
				rel="noopener noreferrer"
				aria-label={m.config_graphql()}
				class="btn preset-outline-tertiary dark:preset-outline-secondary"
			>
				<iconify-icon icon="teenyicons:graphql-solid" class="text-warning-600 text-3xl lg:text-2xl"></iconify-icon>
				<p class="w-full truncate text-xs font-medium uppercase lg:text-sm">{m.config_graphql()}</p>
			</a>
		</PermissionGuard>

		<!-- Editor -->
		<PermissionGuard config={permissionConfigs.imageeditor}>
			<a href="/imageEditor" aria-label={m.config_imageeditor()} class="btn preset-outline-tertiary dark:preset-outline-secondary">
				<iconify-icon icon="bi:image" class="text-primary-600 text-3xl lg:text-2xl"></iconify-icon>
				<p class="w-full truncate text-xs font-medium uppercase lg:text-sm">{m.config_imageeditor()}</p>
			</a>
		</PermissionGuard>

		<!-- Dashboard -->
		<PermissionGuard config={permissionConfigs.dashboard}>
			<a href="/dashboard" class="btn preset-outline-tertiary dark:preset-outline-secondary" aria-label={m.config_Dashboard()}>
				<iconify-icon icon="bi:bar-chart-line" class="text-error-600 text-3xl lg:text-2xl"></iconify-icon>
				<p class="w-full truncate text-xs font-medium uppercase lg:text-sm">{m.config_Dashboard()}</p>
			</a>
		</PermissionGuard>

		<!-- Market Place -->
		<a
			href="https://www.sveltyCMS.com"
			target="_blank"
			rel="noopener noreferrer"
			class="btn preset-tonal-primary border-primary-500 border"
			aria-label={m.config_Martketplace()}
		>
			<iconify-icon icon="icon-park-outline:shopping-bag" class="text-3xl text-white lg:text-2xl"></iconify-icon>
			<p class="w-full truncate text-xs font-medium uppercase lg:text-sm">{m.config_Martketplace()}</p>
		</a>

		<!-- Widget Management -->
		<PermissionGuard config={permissionConfigs.widgetManagement}>
			<a href="/config/widgetManagement" aria-label="Widget Management" class="btn preset-tonal-primary border-primary-500 border">
				<iconify-icon icon="mdi:widgets" class="text-3xl text-white lg:text-2xl"></iconify-icon>
				<p class="w-full truncate text-xs font-medium uppercase lg:text-sm">Widget Management</p>
			</a>
		</PermissionGuard>

		<!-- Theme Management -->
		<PermissionGuard config={permissionConfigs.themeManagement}>
			<a href="/config/themeManagement" aria-label="Theme Management" class="btn preset-tonal-primary border-primary-500 border">
				<iconify-icon icon="ph:layout" class="text-3xl text-white lg:text-2xl"></iconify-icon>
				<p class="w-full truncate text-xs font-medium uppercase lg:text-sm">Themes</p>
			</a>
		</PermissionGuard>

		<!-- Settings -->
		<PermissionGuard config={permissionConfigs.settings}>
			<a href="/config/systemsetting" aria-label="System Settings" class="btn preset-tonal-error border-error-500 border">
				<iconify-icon icon="uil:setting" class="text-3xl text-white lg:text-2xl"></iconify-icon>
				<p class="w-full truncate text-xs font-medium uppercase lg:text-sm">Settings</p>
			</a>
		</PermissionGuard>

		<!-- Access Management -->
		<PermissionGuard config={permissionConfigs.accessManagement}>
			<a href="/config/assessManagement" aria-label="Access Management" class="btn preset-tonal-error border-error-500 border">
				<iconify-icon icon="mdi:account-group" class="text-3xl text-white lg:text-2xl"></iconify-icon>
				<p class="w-full truncate text-xs font-medium uppercase lg:text-sm">Access Management</p>
			</a>
		</PermissionGuard>
	</div>
</div>
