<!--
@files src/routes/(app)/config/+page.svelte
@component
**This file sets up and displays the config page. It provides a user-friendly interface for managing configuration settings.**
-->

<script lang="ts">
	import { onMount } from 'svelte';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import PermissionGuard from '@components/PermissionGuard.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	//Stors
	import { collections } from '@src/stores/collectionStore.svelte';
	import { ui } from '@src/stores/UIStore.svelte.ts';

	// Lucide Icons
	import Hammer from '@lucide/svelte/icons/hammer';
	import Network from '@lucide/svelte/icons/network';
	import Mail from '@lucide/svelte/icons/mail';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
	import Puzzle from '@lucide/svelte/icons/puzzle';
	import Settings from '@lucide/svelte/icons/settings';
	import History from '@lucide/svelte/icons/history';
	import Database from '@lucide/svelte/icons/database';
	import RefreshCcw from '@lucide/svelte/icons/refresh-ccw';
	import Activity from '@lucide/svelte/icons/activity';
	import Users from '@lucide/svelte/icons/users';
	import Wrench from '@lucide/svelte/icons/wrench';

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
			label: m.config_collectionbuilder(),
			icon: Hammer,
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
		{
			id: 'graphql',
			href: '/api/graphql',
			label: m.config_graphql(),
			icon: Network,
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
		{
			id: 'emailPreviews',
			href: '/email-previews',
			label: m.config_emailPreviews(),
			icon: Mail,
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
		{
			id: 'dashboard',
			href: '/dashboard',
			label: m.dashboard(),
			icon: LayoutDashboard,
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
		{
			id: 'marketplace',
			href: 'https://www.sveltyCMS.com',
			label: m.marketplace(),
			icon: ShoppingBag,
			classes:
				'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
			iconColor: 'text-secondary-500',
			target: '_blank',
			permission: null
		},
		{
			id: 'extensions',
			href: '/config/extensions',
			label: 'Extensions',
			icon: Puzzle,
			classes:
				'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
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
			label: m.config_settings(),
			icon: Settings,
			classes:
				'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
			iconColor: 'text-surface-500',
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
			href: '/api/audit?limit=50',
			label: 'Audit Log (Raw)',
			icon: History,
			classes:
				'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
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
			id: 'importExport',
			href: '/config/import-export',
			label: 'Import & Export',
			icon: Database,
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
		// START: New Configuration Manager Button
		{
			id: 'configurationManager',
			href: '/config/configurationManager',
			label: 'Config Manager',
			icon: RefreshCcw,
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
		// END: New Configuration Manager Button
		// START: System Health Monitor
		{
			id: 'systemHealth',
			href: '/config/system-health',
			label: 'System Health',
			icon: Activity,
			classes:
				'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
			iconColor: 'text-success-500',
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
			icon: Users,
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
		}
	];
</script>

<PageTitle name={m.config_pagetitle()} showBackButton={true} backUrl="/" icon={Wrench} />

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
						{#if item.icon}
							{@const Icon = item.icon}
							<div class={`text-3xl lg:text-2xl ${item.iconColor || ''}`}>
								<Icon size={32} />
							</div>
						{/if}
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
					{#if item.icon}
						{@const Icon = item.icon}
						<div class={`text-3xl lg:text-2xl ${item.iconColor || ''}`}>
							<Icon size={32} />
						</div>
					{/if}
					<p class="w-full truncate text-xs font-medium uppercase lg:text-sm">{item.label}</p>
				</a>
			{/if}
		{/each}
	</div>
</div>
