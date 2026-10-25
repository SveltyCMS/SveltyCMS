<!--
@files src/routes/(app)/config/+page.svelte
@component
**This file sets up and displays the config page. It provides a user-friendly interface for managing configuration settings.**
-->

<script lang="ts">
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import { CONFIG_TILE_CLASS } from '@components/ui/config-tile-classes';
	import { matchesConfigQuery, tokenizeConfigQuery } from './config-search';
	import Slot from '@components/system/slot.svelte';
	import AdminZone from '@src/components/system/admin-zone.svelte';
	import PermissionGuard from '@src/components/permission-guard.svelte';
	import { collections } from '@src/stores/collection-store.svelte';
	import { ui } from '@src/stores/ui-store.svelte.ts';
	import { onMount } from 'svelte';
	import { adminFade, adminStagger } from '@utils/admin-transitions';
	import { page } from '$app/state';
	import {
		applayout_systemconfiguration,
		config_page_subtitle,
		config_search_clear,
		config_search_empty,
		config_search_label,
		config_search_placeholder,
		config_search_results,
		config_tile_access,
		config_tile_api,
		config_tile_automations,
		config_tile_builder,
		config_tile_design,
		config_tile_extensions,
		config_tile_monitor,
		config_tile_queue,
		config_tile_redirects,
		config_tile_settings,
		config_tile_sync,
		config_tile_tenants,
		config_tile_trash,
		config_tile_webhooks,
		config_tile_workflows,
		config_tile_dashboard,
		config_tile_email
	} from '@src/paraglide/messages';

	let { data } = $props();

	const showTenantsTile = $derived(
		(page.data.isMultiTenant as boolean) && data.isAdmin && !page.data.tenantId
	);

	onMount(() => {
		collections.setCollection(null);
	});

	function handleMobileSidebarClose() {
		// Hide sidebar on mobile before navigation
		if (typeof window !== 'undefined' && window.innerWidth < 768) {
			ui.toggle('leftSidebar', 'hidden');
		}
	}

	// Icon grid — flat, scannable, mobile-first.
	// Order defines visual grouping. Comments mark domain boundaries.
	// Plugins that need a config page register here; plugins that only add
	// settings tabs or monitor panels don't need their own tile.
	const configItems = [
		// ── System ──
		{
			id: 'settings',
			href: '/config/system-settings',
			label: 'System Settings',
			icon: 'uil:setting',
			iconColor: '',
			permission: {
				contextId: 'config:settings',
				name: 'System Settings',
				description: 'Database and infrastructure configuration — extensible via plugins',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'system'
			}
		},
		{
			id: 'tenants',
			href: '/admin/tenants',
			label: 'Tenants',
			icon: 'mdi:office-building',
			iconColor: 'text-tertiary-500',
			visible: () => showTenantsTile,
			permission: {
				contextId: 'config:settings',
				name: 'Tenant Management',
				description: 'Manage multi-tenant workspaces and provisioning',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'system'
			}
		},
		{
			id: 'designSystem',
			href: '/config/design-system',
			label: 'Design System',
			icon: 'mdi:compass-outline',
			iconColor: 'text-tertiary-500',
			permission: {
				contextId: 'config:appearance',
				name: 'Design System',
				description: 'Appearance, themes, personal overrides, density, and live component preview',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'configuration'
			}
		},
		{
			id: 'monitor',
			href: '/config/monitor',
			label: 'System Monitor',
			icon: 'mdi:shield-check-outline',
			iconColor: '',
			permission: {
				contextId: 'config:systemMonitor',
				name: 'System Monitor',
				description: 'Health dashboard, audit log, and plugin status',
				requiredRole: 'admin',
				action: 'view',
				contextType: 'system'
			}
		},
		// ── Content ──
		{
			id: 'collectionbuilder',
			href: '/config/collectionbuilder',
			label: 'Collection Builder',
			icon: 'fluent-mdl2:build-definition',
			iconColor: '',
			permission: {
				contextId: 'config:collectionManagement',
				name: 'Collection Builder',
				description: 'Visual content-modeling and schema builder',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'configuration'
			}
		},
		// ── Security ──
		{
			id: 'accessManagement',
			href: '/config/access-management',
			label: 'Access Management',
			icon: 'mdi:account-group',
			iconColor: 'text-error-500',
			permission: {
				contextId: 'config:accessManagement',
				name: 'Access Management',
				description: 'Users, roles, permissions, and website tokens',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'configuration'
			}
		},
		// ── Extensions ──
		{
			id: 'extensions',
			href: '/config/extensions',
			label: 'Extensions',
			icon: 'mdi:puzzle-outline',
			iconColor: 'text-tertiary-500',
			permission: {
				contextId: 'config:extensions',
				name: 'Extensions',
				description: 'Plugins, widgets, themes, and marketplace',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'configuration'
			}
		},
		// ── Operations ──
		{
			id: 'automations',
			href: '/config/automations',
			label: 'Automations',
			icon: 'mdi:robot-outline',
			iconColor: 'text-warning-500',
			permission: {
				contextId: 'config:automations',
				name: 'Automations',
				description: 'Event-driven workflow automations',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'configuration'
			}
		},
		{
			id: 'workflows',
			href: '/config/workflows',
			label: 'Workflows',
			icon: 'mdi:state-machine',
			iconColor: 'text-primary-500',
			permission: {
				contextId: 'config:automations',
				name: 'Workflows',
				description: 'Content review stages and state transitions',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'configuration'
			}
		},
		{
			id: 'queue',
			href: '/config/queue',
			label: 'Background Queue',
			icon: 'mdi:playlist-play',
			iconColor: '',
			permission: {
				contextId: 'config:queue',
				name: 'Background Queue',
				description: 'Monitor background jobs and retry failed tasks',
				requiredRole: 'admin',
				action: 'view',
				contextType: 'system'
			}
		},
		{
			id: 'sync',
			href: '/config/sync',
			label: 'Data Sync',
			icon: 'mdi:sync-circle',
			iconColor: '',
			permission: {
				contextId: 'config:synchronization',
				name: 'Data Sync',
				description: 'Import content from external platforms and sync config to filesystem',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'system'
			}
		},
		// ── Tools ──
		{
			id: 'apiPlayground',
			href: '/config/api',
			label: 'API Playground',
			icon: 'mdi:api',
			iconColor: 'text-warning-500',
			permission: {
				contextId: 'api:graphql',
				name: 'API Playground',
				description: 'Interactive REST (OpenAPI) and GraphQL developer console',
				requiredRole: 'developer',
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
				description: 'Content metrics and activity overview',
				requiredRole: 'user',
				action: 'access',
				contextType: 'system'
			}
		},
		{
			id: 'emailPreviews',
			href: '/email-previews',
			label: 'Email Previews',
			icon: 'mdi:email-outline',
			iconColor: '',
			target: '_blank',
			permission: {
				contextId: 'system:admin',
				name: 'Email Previews',
				description: 'Preview transactional email templates',
				requiredRole: 'admin',
				action: 'access',
				contextType: 'system'
			}
		},
		// ── TBD: features under review for final placement ──
		{
			id: 'webhooks',
			href: '/config/webhooks',
			label: 'Webhooks',
			icon: 'mdi:webhook',
			iconColor: 'text-warning-600',
			permission: {
				contextId: 'config:webhooks',
				name: 'Webhooks',
				description: 'Outgoing HTTP callbacks on content events',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'configuration'
			}
		},
		{
			id: 'redirects',
			href: '/config/redirects',
			label: 'Redirects',
			icon: 'mdi:arrow-decision',
			iconColor: 'text-tertiary-500',
			permission: {
				contextId: 'config:redirects',
				name: 'Redirects',
				description: '301/302 redirect rules with regex support',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'configuration'
			}
		},
		{
			id: 'trash',
			href: '/config/trash',
			label: 'Trash',
			icon: 'mdi:delete-restore',
			iconColor: 'text-error-500 dark:text-error-400',
			permission: {
				contextId: 'config:trash',
				name: 'Trash',
				description: 'Recover or permanently delete soft-deleted content',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'configuration'
			}
		}
	];

	const tileLabel = (id: string, fallback: string): string => {
		const labels: Record<string, () => string> = {
			settings: config_tile_settings,
			tenants: config_tile_tenants,
			designSystem: config_tile_design,
			monitor: config_tile_monitor,
			collectionbuilder: config_tile_builder,
			accessManagement: config_tile_access,
			extensions: config_tile_extensions,
			automations: config_tile_automations,
			workflows: config_tile_workflows,
			queue: config_tile_queue,
			sync: config_tile_sync,
			apiPlayground: config_tile_api,
			dashboard: config_tile_dashboard,
			emailPreviews: config_tile_email,
			webhooks: config_tile_webhooks,
			redirects: config_tile_redirects,
			trash: config_tile_trash
		};
		return labels[id]?.() ?? fallback;
	};

	// ── Tile search ──────────────────────────────────────────────────────────
	let configSearch = $state('');

	const isSearching = $derived(configSearch.trim().length > 0);
	const searchTokens = $derived(tokenizeConfigQuery(configSearch));

	/**
	 * Mirror `PermissionGuard` so the result count never promises a tile the
	 * guard then hides (the guard still wraps each rendered tile).
	 */
	function isTileAllowed(item: (typeof configItems)[number]): boolean {
		const contextId = item.permission?.contextId;
		if (!contextId) return true;
		const entry = data?.permissions?.[contextId];
		if (typeof entry === 'boolean') return entry;
		if (typeof entry?.hasPermission === 'boolean') return entry.hasPermission;
		return data?.isAdmin === true;
	}

	const visibleConfigItems = $derived(
		configItems.filter(
			(item) =>
				(!('visible' in item) || item.visible?.()) &&
				isTileAllowed(item) &&
				matchesConfigQuery(
					{
						id: item.id,
						label: item.label,
						displayLabel: tileLabel(item.id, item.label),
						name: item.permission?.name,
						description: item.permission?.description
					},
					searchTokens
				)
		)
	);
</script>

<AdminPageShell
	title={applayout_systemconfiguration()}
	showBackButton={true}
	backUrl="/"
	icon="material-symbols:build-circle"
>
	<AdminCard class="p-4 shadow-sm">
		<h2 class="h2 mb-4 text-center font-bold text-tertiary-600 dark:text-primary-500" in:adminFade>
			{config_page_subtitle()}
		</h2>

		<!-- Filter the tile grid below the subtitle -->
		<div class="mx-auto mb-4 max-w-md" in:adminFade>
			<Input
				bind:value={configSearch}
				type="text"
				label={config_search_label()}
				labelClass="sr-only"
				placeholder={config_search_placeholder()}
				autocomplete="off"
				enterkeyhint="search"
				data-testid="config-search"
				onkeydown={(event) => {
					if (event.key === 'Escape' && configSearch) {
						event.preventDefault();
						configSearch = '';
					}
				}}
			>
				{#snippet pre()}
					<iconify-icon icon="mdi:magnify" width="18" aria-hidden="true"></iconify-icon>
				{/snippet}
				{#snippet post()}
					{#if isSearching}
						<Button
							variant="transparent"
							size="sm"
							rounded
							type="button"
							class="size-7 min-w-0 p-0! text-(--admin-text-muted) hover:bg-surface-500/10 hover:text-(--admin-text-body)"
							onclick={() => (configSearch = '')}
							aria-label={config_search_clear()}
							data-testid="config-search-clear"
						>
							<iconify-icon icon="mdi:close" width="16" aria-hidden="true"></iconify-icon>
						</Button>
					{/if}
				{/snippet}
			</Input>
			{#if isSearching}
				<p
					class="mt-2 text-center text-xs text-(--admin-text-muted)"
					role="status"
					aria-live="polite"
					data-testid="config-search-results"
				>
					{config_search_results({ count: visibleConfigItems.length })}
				</p>
			{/if}
		</div>

		<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
			{#each visibleConfigItems as item, idx (item.id || item.label)}
				{const usePermissionGuard = !!item.permission}

				{#if usePermissionGuard}
					<div in:adminStagger={{ index: idx }}>
						<PermissionGuard {...{ config: item.permission } as any}>
							<a
								href={item.href}
								class={CONFIG_TILE_CLASS}
								aria-label={tileLabel(item.id, item.label)}
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
									class="w-full truncate text-xs font-medium uppercase tracking-wide group-hover:text-tertiary-600 dark:group-hover:text-tertiary-500 dark:text-primary-500 lg:text-sm"
								>
									{tileLabel(item.id, item.label)}
								</p>
							</a>
						</PermissionGuard>
					</div>
				{:else}
					<div in:adminStagger={{ index: idx }}>
						<a
							href={item.href}
							class={CONFIG_TILE_CLASS}
							aria-label={tileLabel(item.id, item.label)}
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
								class="w-full truncate text-xs font-medium uppercase tracking-wide text-surface-600 group-hover:text-tertiary-600 dark:text-primary-600 dark:group-hover:text-primary-500 lg:text-sm"
							>
								{tileLabel(item.id, item.label)}
							</p>
						</a>
					</div>
				{/if}
			{/each}

			{#if isSearching && visibleConfigItems.length === 0}
				<div
					class="col-span-full flex flex-col items-center justify-center gap-3 py-10 text-center"
					data-testid="config-search-empty"
				>
					<iconify-icon
						icon="mdi:magnify-close"
						width="36"
						class="text-(--admin-text-muted)"
						aria-hidden="true"
					></iconify-icon>
					<p class="text-sm text-(--admin-text-muted)">
						{config_search_empty({ query: configSearch.trim() })}
					</p>
					<Button variant="tertiary" size="sm" type="button" onclick={() => (configSearch = '')}>
						{config_search_clear()}
					</Button>
				</div>
			{/if}

			<!-- Plugin-provided grid tiles cannot be filtered by label, so they return
			     when the search is cleared. -->
			<div class={isSearching ? 'hidden' : 'contents'}>
				<!-- Plugin config_grid slots (each plugin supplies its own tile GUI) -->
				<div class="contents" in:adminStagger={{ index: configItems.length }}>
					<PermissionGuard
						{...{
							config: {
								contextId: 'config:extensions',
								name: 'Plugin Extensions',
								description: 'Plugin-owned config tiles and tools',
								requiredRole: 'admin',
								action: 'manage',
								contextType: 'configuration'
							}
						} as any}
					>
						<Slot
							name="config_grid"
							inline={true}
							props={{
								pluginStates: data?.pluginStates ?? {},
								isPro: false,
								enabled: data?.pluginStates?.['smart-importer'] ?? true
							}}
						/>
					</PermissionGuard>
				</div>

				<Slot name="config" props={{ pluginStates: data?.pluginStates ?? {} }} />
				<AdminZone zone="config" context={{ pluginStates: data?.pluginStates ?? {} }} />
			</div>
		</div>
	</AdminCard>
</AdminPageShell>
