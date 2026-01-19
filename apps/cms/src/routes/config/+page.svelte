<!--
@files src/routes/(app)/config/+page.svelte
@component
**This file sets up and displays the config page. It provides a user-friendly interface for managing configuration settings.**
-->

<script lang="ts">
	import PageTitle from '@cms/components/PageTitle.svelte';
	import PermissionGuard from '@cms/components/PermissionGuard.svelte';
	import * as m from '@shared/paraglide/messages';
	import { collections } from '@cms/stores/collectionStore.svelte';
	import { ui } from '@cms/stores/UIStore.svelte';
	import { onMount } from 'svelte';

	onMount(() => {
		collections.setCollection(null);
	});

	function handleMobileSidebarClose() {
		// Hide sidebar on mobile before navigation
		if (typeof window !== 'undefined' && window.innerWidth < 768) {
			ui.toggle('leftSidebar', 'hidden');
		}
	}

	// A single, data-driven array to define all configuration items.
	const configItems = [
		// Collection Builder
		{
			id: 'collectionbuilder',
			href: '/config/collectionbuilder',
			label: m.config_collectionbuilder(),
			icon: 'fluent-mdl2:build-definition',
			classes:
				'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
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
		// GraphQL
		{
			id: 'graphql',
			href: '/api/graphql',
			label: m.config_graphql(),
			icon: 'teenyicons:graphql-solid',
			classes:
				'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
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
		// Email Previews
		{
			id: 'emailPreviews',
			href: '/email-previews',
			label: m.config_emailPreviews(),
			icon: 'mdi:email-outline',
			classes:
				'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
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
		// Dashboard
		{
			id: 'dashboard',
			href: '/dashboard',
			label: m.dashboard(),
			icon: 'bi:bar-chart-line',
			classes:
				'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
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
		// Marketplace
		{
			id: 'marketplace',
			href: 'https://www.sveltyCMS.com',
			label: m.marketplace(),
			icon: 'icon-park-outline:shopping-bag',
			classes:
				'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
			iconColor: 'text-secondary-500',
			target: '_blank',
			permission: null
		},

		// Extension Management
		{
			id: 'extensions',
			href: '/config/extensions',
			label: 'Extensions',
			icon: 'mdi:puzzle-outline',
			classes:
				'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
			iconColor: 'text-indigo-500',
			permission: {
				contextId: 'config:extensions',
				name: 'Extension Management',
				description: 'Manage plugins, widgets, and themes',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'configuration'
			}
		},
		// Access Management
		{
			id: 'accessManagement',
			// FIX: Corrected typo from 'assessManagement'
			href: '/config/accessManagement',
			label: m.config_accessManagement(),
			icon: 'mdi:account-group',
			classes:
				'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
			iconColor: 'text-error-500',
			permission: {
				contextId: 'config:accessManagement',
				name: 'Access Management',
				description: 'Manage user access and roles',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'configuration'
			}
		},

		// Settings
		{
			id: 'settings',
			href: '/config/systemsetting',
			label: m.config_settings(),
			icon: 'uil:setting',
			classes:
				'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
			iconColor: 'text-surface-400',
			permission: {
				contextId: 'config:settings',
				name: 'Settings',
				description: 'Manage system settings',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'system'
			}
		},

		// Import & Export
		{
			id: 'importExport',
			href: '/config/import-export',
			label: 'Import & Export',
			icon: 'mdi:database-import',
			classes:
				'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
			iconColor: 'text-warning-500',
			permission: {
				contextId: 'config:importExport',
				name: 'Import & Export',
				description: 'Import and export system data',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'system'
			}
		},

		// Configuration Manager
		{
			id: 'configurationManager',
			href: '/config/configurationManager',
			label: 'Config Manager',
			icon: 'mdi:sync-circle',
			classes:
				'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
			iconColor: 'text-secondary-500',
			permission: {
				contextId: 'config:synchronization',
				name: 'Configuration Manager',
				description: 'Synchronize configuration between filesystem and database.',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'system'
			}
		},

		// System Health Monitor
		{
			id: 'systemHealth',
			href: '/config/system-health',
			label: 'System Health',
			icon: 'mdi:heart-pulse',
			classes:
				'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
			iconColor: 'text-warning-500',
			permission: {
				contextId: 'config:systemHealth',
				name: 'System Health',
				description: 'Monitor system services and health status',
				requiredRole: 'admin',
				action: 'view',
				contextType: 'system'
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
					<a
						href={item.href}
						class={`flex h-24 flex-col items-center justify-center gap-2 rounded p-2 text-center shadow-md transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-lg lg:h-20 ${item.classes}`}
						aria-label={item.label}
						target={item.target}
						rel={item.target === '_blank' ? 'noopener noreferrer' : undefined}
						data-sveltekit-preload-data={item.target === '_blank' ? undefined : 'hover'}
						onclick={handleMobileSidebarClose}
					>
						<iconify-icon icon={item.icon} class={`text-3xl lg:text-2xl ${item.iconColor || ''}`}></iconify-icon>
						<p class="w-full truncate text-xs font-medium uppercase lg:text-sm">{item.label}</p>
					</a>
				</PermissionGuard>
			{:else}
				<a
					href={item.href}
					class={`flex h-24 flex-col items-center justify-center gap-2 rounded p-2 text-center shadow-md transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-lg lg:h-20 ${item.classes}`}
					aria-label={item.label}
					target={item.target}
					rel={item.target === '_blank' ? 'noopener noreferrer' : undefined}
					data-sveltekit-preload-data={item.target === '_blank' ? undefined : 'hover'}
					onclick={handleMobileSidebarClose}
				>
					<iconify-icon icon={item.icon} class={`text-3xl lg:text-2xl ${item.iconColor || ''}`}></iconify-icon>
					<p class="w-full truncate text-xs font-medium uppercase lg:text-sm">{item.label}</p>
				</a>
			{/if}
		{/each}
	</div>
</div>
