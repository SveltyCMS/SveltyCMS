<!--
@files src/routes/(app)/config/+page.svelte
@component
**This file sets up and displays the config page. It provides a user-friendly interface for managing configuration settings.**
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import PageTitle from '@components/PageTitle.svelte';
	import PermissionGuard from '@components/PermissionGuard.svelte';
	import * as m from '@src/paraglide/messages';
	import { setCollection } from '@src/stores/collectionStore.svelte';
	import { toggleUIElement } from '@src/stores/UIStore.svelte';
	import { onMount } from 'svelte';

	onMount(() => {
		setCollection(null);
	});

	function handleInternalNavigation(href: string, target?: string) {
		// Only handle internal links (not external ones with target="_blank")
		if (target === '_blank') {
			return; // Let the browser handle external links normally
		}

		// Hide sidebar on mobile before navigation
		if (typeof window !== 'undefined' && window.innerWidth < 768) {
			console.log('Mobile detected, hiding sidebar before navigation to:', href);
			toggleUIElement('leftSidebar', 'hidden');
		}

		// Navigate to the route
		goto(href);
	}

	// A single, data-driven array to define all configuration items.
	const configItems = [
		{
			id: 'collectionbuilder',
			href: '/config/collectionbuilder',
			label: m.config_collectionbuilder(),
			icon: 'fluent-mdl2:build-definition',
			classes: 'variant-outline-tertiary dark:variant-outline-secondary border-2 border-tertiary-500/50 dark:border-secondary-500/50',
			iconColor: 'text-tertiary-600',
			permission: {
				contextId: 'config:collectionManagement',
				name: 'Collection Builder',
				description: 'Manage and build collections',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'configuration'
			}
		},
		{
			id: 'graphql',
			href: '/api/graphql',
			label: m.config_graphql(),
			icon: 'teenyicons:graphql-solid',
			classes: 'variant-outline-tertiary dark:variant-outline-secondary border-2 border-tertiary-500/50 dark:border-secondary-500/50',
			iconColor: 'text-warning-600',
			target: '_blank',
			permission: {
				contextId: 'api:graphql',
				name: 'GraphQL',
				description: 'Access GraphQL API',
				requiredRole: 'developer',
				action: 'access',
				contextType: 'system'
			}
		},
		{
			id: 'imageeditor',
			href: '/imageEditor',
			label: m.config_imageeditor(),
			icon: 'bi:image',
			classes: 'variant-outline-tertiary dark:variant-outline-secondary border-2 border-tertiary-500/50 dark:border-secondary-500/50',
			iconColor: 'text-primary-600',
			permission: {
				contextId: 'content:images',
				name: 'Image Editor',
				description: 'Edit and manage images',
				requiredRole: 'editor',
				action: 'manage',
				contextType: 'system'
			}
		},
		{
			id: 'emailPreviews',
			href: '/email-previews',
			label: m.config_emailPreviews(),
			icon: 'mdi:email-outline',
			classes: 'variant-outline-tertiary dark:variant-outline-secondary border-2 border-tertiary-500/50 dark:border-secondary-500/50',
			iconColor: 'text-primary-600',
			target: '_blank',
			permission: {
				contextId: 'system:admin',
				name: 'Email Previews',
				description: 'Preview system emails',
				requiredRole: 'admin',
				action: 'access',
				contextType: 'system'
			}
		},
		{
			id: 'dashboard',
			href: '/dashboard',
			label: m.dashboard(),
			icon: 'bi:bar-chart-line',
			classes: 'variant-ghost-primary dark:text-white',
			iconColor: 'text-error-600',
			permission: {
				contextId: 'system:dashboard',
				name: 'Dashboard',
				description: 'Access system dashboard',
				requiredRole: 'user',
				action: 'access',
				contextType: 'system'
			}
		},
		{
			id: 'marketplace',
			href: 'https://www.sveltyCMS.com',
			label: m.marketplace(),
			icon: 'icon-park-outline:shopping-bag',
			classes: 'variant-ghost-primary dark:text-white',
			target: '_blank',
			permission: null
		},
		{
			id: 'widgetManagement',
			href: '/config/widgetManagement',
			label: m.config_widgetManagement(),
			icon: 'mdi:widgets',
			classes: 'variant-ghost-primary dark:text-white',
			permission: {
				contextId: 'config:widgetManagement',
				name: 'Widget Management',
				description: 'Manage system widgets',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'configuration'
			}
		},
		{
			id: 'themeManagement',
			href: '/config/themeManagement',
			label: m.config_themeManagement(),
			icon: 'ph:layout',
			classes: 'variant-ghost-primary dark:text-white',
			permission: {
				contextId: 'config:themeManagement',
				name: 'Theme Management',
				description: 'Manage system themes',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'configuration'
			}
		},
		{
			id: 'settings',
			href: '/config/systemsetting',
			label: m.config_settings(),
			icon: 'uil:setting',
			classes: 'variant-ghost-error dark:text-white',
			permission: {
				// FIX: Changed from 'system:settings' to 'config:settings' to match +page.server.ts
				contextId: 'config:settings',
				name: 'Settings',
				description: 'Manage system settings',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'system'
			}
		},
		{
			id: 'importExport',
			href: '/config/import-export',
			label: 'Import & Export',
			icon: 'mdi:database-import',
			classes: 'variant-ghost-warning dark:text-white',
			permission: {
				contextId: 'config:importExport',
				name: 'Import & Export',
				description: 'Import and export system data',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'system'
			}
		},
		// START: New Configuration Manager Button
		{
			id: 'configurationManager',
			href: '/config/configurationManager',
			label: 'Config Manager',
			icon: 'mdi:sync-circle',
			classes: 'variant-ghost-secondary dark:text-white',
			permission: {
				contextId: 'config:synchronization',
				name: 'Configuration Manager',
				description: 'Synchronize configuration between filesystem and database.',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'system'
			}
		},
		// END: New Configuration Manager Button
		// START: System Health Monitor
		{
			id: 'systemHealth',
			href: '/config/system-health',
			label: 'System Health',
			icon: 'mdi:heart-pulse',
			classes: 'variant-ghost-success dark:text-white',
			permission: {
				contextId: 'config:systemHealth',
				name: 'System Health',
				description: 'Monitor system services and health status',
				requiredRole: 'admin',
				action: 'view',
				contextType: 'system'
			}
		},
		// END: System Health Monitor
		{
			id: 'accessManagement',
			// FIX: Corrected typo from 'assessManagement'
			href: '/config/accessManagement',
			label: m.config_accessManagement(),
			icon: 'mdi:account-group',
			classes: 'variant-ghost-error dark:text-white',
			permission: {
				contextId: 'config:accessManagement',
				name: 'Access Management',
				description: 'Manage user access and roles',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'configuration'
			}
		}
	];
</script>

<PageTitle name={m.config_pagetitle()} showBackButton={true} backUrl="/" icon="material-symbols:build-circle" />

<div class="wrapper mb-2 max-h-[calc(100vh-65px)] overflow-auto p-2">
	<h2 class="h2 mb-4 text-center font-bold text-tertiary-600 dark:text-primary-500">
		{m.config_body()}
	</h2>

	<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
		{#each configItems as item (item.id)}
			{@const usePermissionGuard = !!item.permission}

			{#if usePermissionGuard}
				<PermissionGuard config={item.permission}>
					{#if item.target === '_blank'}
						<a href={item.href} class="config-btn {item.classes}" aria-label={item.label} target="_blank" rel="noopener noreferrer">
							<iconify-icon icon={item.icon} class="config-icon {item.iconColor || ''}"></iconify-icon>
							<p class="config-text">{item.label}</p>
						</a>
					{:else}
						<button
							type="button"
							class="config-btn {item.classes}"
							aria-label={item.label}
							onclick={() => handleInternalNavigation(item.href, item.target)}
						>
							<iconify-icon icon={item.icon} class="config-icon {item.iconColor || ''}"></iconify-icon>
							<p class="config-text">{item.label}</p>
						</button>
					{/if}
				</PermissionGuard>
			{:else if item.target === '_blank'}
				<a href={item.href} class="config-btn {item.classes}" aria-label={item.label} target="_blank" rel="noopener noreferrer">
					<iconify-icon icon={item.icon} class="config-icon {item.iconColor || ''}"></iconify-icon>
					<p class="config-text">{item.label}</p>
				</a>
			{:else}
				<button
					type="button"
					class="config-btn {item.classes}"
					aria-label={item.label}
					onclick={() => handleInternalNavigation(item.href, item.target)}
				>
					<iconify-icon icon={item.icon} class="config-icon {item.iconColor || ''}"></iconify-icon>
					<p class="config-text">{item.label}</p>
				</button>
			{/if}
		{/each}
	</div>
</div>

<style lang="postcss">
	:global(.config-btn) {
		@apply flex h-24 flex-col items-center justify-center gap-2 rounded p-2 text-center shadow-md transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-lg lg:h-20;
	}
	:global(.config-icon) {
		@apply text-3xl lg:text-2xl;
	}
	:global(.config-text) {
		@apply w-full truncate text-xs font-medium uppercase lg:text-sm;
	}
</style>
