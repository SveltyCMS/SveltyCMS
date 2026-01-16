<!--
@files src/routes/(app)/config/+page.svelte
@component
**This file sets up and displays the config page. It provides a user-friendly interface for managing configuration settings.**
-->

<script lang="ts">
	import PageTitle from '@components/PageTitle.svelte';
	import PermissionGuard from '@components/PermissionGuard.svelte';
	import * as m from '@src/paraglide/messages';
	import { setCollection } from '@src/stores/collectionStore.svelte';
	import { toggleUIElement } from '@src/stores/UIStore.svelte';
	import { onMount } from 'svelte';

	onMount(() => {
		setCollection(null);
	});

	function handleMobileSidebarClose() {
		// Hide sidebar on mobile before navigation
		if (typeof window !== 'undefined' && window.innerWidth < 768) {
			toggleUIElement('leftSidebar', 'hidden');
		}
	}

	// A single, data-driven array to define all configuration items.
	const configItems = [
		{
			id: 'collectionbuilder',
			href: '/config/collectionbuilder',
			label: m.config_collectionbuilder(),
			icon: 'fluent-mdl2:build-definition',
			classes: 'preset-outlined-tertiary-500 dark:preset-outlined-secondary-500 border-2 border-tertiary-500/50 dark:border-secondary-500/50',
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
			classes: 'preset-outlined-tertiary-500 dark:preset-outlined-secondary-500 border-2 border-tertiary-500/50 dark:border-secondary-500/50',
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
			id: 'emailPreviews',
			href: '/email-previews',
			label: m.config_emailPreviews(),
			icon: 'mdi:email-outline',
			classes: 'preset-outlined-tertiary-500 dark:preset-outlined-secondary-500 border-2 border-tertiary-500/50 dark:border-secondary-500/50',
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
			classes: 'preset-ghost-primary-500 dark:text-white',
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
			classes: 'preset-ghost-primary-500 dark:text-white',
			target: '_blank',
			permission: null
		},
		{
			id: 'widgetManagement',
			href: '/config/widgetManagement',
			label: m.config_widgetManagement(),
			icon: 'mdi:widgets',
			classes: 'preset-ghost-primary-500 dark:text-white',
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
			classes: 'preset-ghost-primary-500 dark:text-white',
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
			classes: 'preset-ghost-error-500 dark:text-white',
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
			classes: 'preset-ghost-warning-500 dark:text-white',
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
			classes: 'preset-ghost-secondary-500 dark:text-white',
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
			classes: 'preset-ghost-success-500 dark:text-white',
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
			classes: 'preset-ghost-error-500 dark:text-white',
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
