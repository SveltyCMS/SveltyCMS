<!--
@files src/routes/(app)/config/+page.svelte
@component
**This file sets up and displays the config page. It provides a user-friendly interface for managing configuration settings.**
-->

<script lang="ts">
	import PageTitle from '@src/components/page-title.svelte';
	import PermissionGuard from '@src/components/permission-guard.svelte';
	import { collections } from '@src/stores/collection-store.svelte';
	import { ui } from '@src/stores/ui-store.svelte.ts';
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
		{
			id: 'collectionbuilder',
			href: '/config/collectionbuilder',
			label: 'Collection Builder',
			icon: 'fluent-mdl2:build-definition',
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
			label: 'GraphQL',
			icon: 'teenyicons:graphql-solid',
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
			label: 'Email Previews',
			icon: 'mdi:email-outline',
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
			label: 'Dashboard',
			icon: 'bi:bar-chart-line',
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
			label: 'Marketplace',
			icon: 'icon-park-outline:shopping-bag',
			iconColor: 'text-secondary-500',
			target: '_blank',
			permission: {
				contextId: 'config:marketplace',
				name: 'Marketplace',
				description: 'Access SveltyCMS Marketplace',
				requiredRole: 'admin',
				action: 'access',
				contextType: 'system'
			}
		},
		{
			id: 'extensions',
			href: '/config/extensions',
			label: 'Extensions',
			icon: 'mdi:puzzle-outline',
			iconColor: 'text-tertiary-500',
			permission: {
				contextId: 'config:extensions',
				name: 'Extensions',
				description: 'Manage plugins, widgets and themes',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'configuration'
			}
		},
		{
			id: 'settings',
			href: '/config/systemsetting',
			label: 'Settings',
			icon: 'uil:setting',
			iconColor: 'text-secondary-500',
			permission: {
				contextId: 'config:settings',
				name: 'Settings',
				description: 'Manage system settings',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'system'
			}
		},
		{
			id: 'audit',
			href: '/api/dashboard/audit?limit=50',
			label: 'Audit Log (Raw)',
			icon: 'mdi:history',
			iconColor: 'text-primary-500',
			target: '_blank',
			permission: {
				contextId: 'config:audit',
				name: 'Audit Log',
				description: 'View system audit logs',
				requiredRole: 'admin',
				action: 'view',
				contextType: 'system'
			}
		},
		{
			href: '/config/sync',
			label: 'Config Sync',
			icon: 'mdi:sync-circle',
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
		// END: New Configuration Manager Button
		// START: System Health Monitor
		{
			id: 'systemHealth',
			href: '/config/system-health',
			label: 'System Health',
			icon: 'mdi:heart-pulse',
			iconColor: 'text-primary-500',
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
			href: '/config/accessManagement',
			label: 'Access Management',
			icon: 'mdi:account-group',
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
		{
			id: 'webhooks',
			href: '/config/webhooks',
			label: 'Webhooks',
			icon: 'mdi:webhook',
			iconColor: 'text-warning-600',
			permission: {
				contextId: 'config:webhooks',
				name: 'Webhooks',
				description: 'Manage HTTP webhooks',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'configuration'
			}
		},
		{
			id: 'automations',
			href: '/config/automations',
			label: 'Automations',
			icon: 'mdi:robot-outline',
			iconColor: 'text-warning-600',
			permission: {
				contextId: 'config:automations',
				name: 'Automations',
				description: 'Manage automated workflows',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'configuration'
			}
		}
	];
</script>

<PageTitle name="System Configuration" showBackButton={true} backUrl="/" icon="material-symbols:build-circle" />

<div class="wrapper mb-2 max-h-[calc(100vh-65px)] overflow-auto p-2">
	<h2 class="h2 mb-4 text-center font-bold text-tertiary-600 dark:text-primary-500">Manage your system configuration</h2>

	<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
		{#each configItems as item (item.id || item.label)}
			{@const usePermissionGuard = !!item.permission}

			{#if usePermissionGuard}
				<PermissionGuard config={item.permission}>
					<a
						href={item.href}
						class="flex h-24 flex-col items-center justify-center gap-2 rounded-xl border border-surface-200 bg-white p-2 text-center shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:border-primary-500 hover:bg-primary-50 hover:shadow-xl dark:border-surface-700 dark:bg-surface-800 dark:hover:border-primary-500 dark:hover:bg-surface-700 lg:h-32"
						aria-label={item.label}
						target={item.target}
						rel={item.target === '_blank' ? 'noopener noreferrer' : undefined}
						data-sveltekit-preload-data={item.target === '_blank' ? undefined : 'hover'}
						onclick={handleMobileSidebarClose}
					>
						<iconify-icon
							icon={item.icon}
							class={`text-3xl lg:text-4xl ${item.iconColor || ''} transition-transform duration-300 group-hover:scale-110`}
						></iconify-icon>
						<p
							class="w-full truncate text-xs font-medium uppercase tracking-wide group-hover:text-primary-600 dark:group-hover:text-primary-400 lg:text-sm"
						>
							{item.label}
						</p>
					</a>
				</PermissionGuard>
			{:else}
				<a
					href={item.href}
					class="group flex h-24 flex-col items-center justify-center gap-2 rounded-xl border border-surface-200 bg-white p-2 text-center shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:border-primary-500 hover:bg-primary-50 hover:shadow-xl dark:border-surface-700 dark:bg-surface-800 dark:hover:border-primary-500 dark:hover:bg-surface-700 lg:h-32"
					aria-label={item.label}
					target={item.target}
					rel={item.target === '_blank' ? 'noopener noreferrer' : undefined}
					data-sveltekit-preload-data={item.target === '_blank' ? undefined : 'hover'}
					onclick={handleMobileSidebarClose}
				>
					<iconify-icon
						icon={item.icon}
						class={`text-3xl lg:text-4xl ${item.iconColor || ''} transition-transform duration-300 group-hover:scale-110`}
					></iconify-icon>
					<p
						class="w-full truncate text-xs font-medium uppercase tracking-wide text-surface-600 dark:text-surface-300 group-hover:text-primary-600 dark:group-hover:text-primary-400 lg:text-sm"
					>
						{item.label}
					</p>
				</a>
			{/if}
		{/each}
	</div>
</div>
