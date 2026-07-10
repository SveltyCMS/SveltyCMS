<!--
@files src/routes/(app)/config/+page.svelte
@component
**This file sets up and displays the config page. It provides a user-friendly interface for managing configuration settings.**
-->

<script lang="ts">
import AdminPageShell from "@components/admin-page-shell.svelte";
import Slot from "@components/system/slot.svelte";
import PermissionGuard from "@src/components/permission-guard.svelte";
import { collections } from "@src/stores/collection-store.svelte";
import { ui } from "@src/stores/ui-store.svelte.ts";
import { onMount } from "svelte";
import { fade, fly } from "svelte/transition";
import { page } from "$app/state";

let { data } = $props();

const showTenantsTile = $derived(
	(page.data.isMultiTenant as boolean) && data.isAdmin && !page.data.tenantId,
);

onMount(() => {
	collections.setCollection(null);
});

function handleMobileSidebarClose() {
	// Hide sidebar on mobile before navigation
	if (typeof window !== "undefined" && window.innerWidth < 768) {
		ui.toggle("leftSidebar", "hidden");
	}
}

// Icon grid — flat, scannable, mobile-first.
// Order defines visual grouping. Comments mark domain boundaries.
// Plugins that need a config page register here; plugins that only add
// settings tabs or monitor panels don't need their own tile.
const configItems = [
	// ── System ──
	{
		id: "settings",
		href: "/config/system-settings",
		label: "System Settings",
		icon: "uil:setting",
		iconColor: "",
		permission: {
			contextId: "config:settings",
			name: "System Settings",
			description: "Database and infrastructure configuration — extensible via plugins",
			requiredRole: "admin",
			action: "manage",
			contextType: "system",
		},
	},
	{
		id: "tenants",
		href: "/admin/tenants",
		label: "Tenants",
		icon: "mdi:office-building",
		iconColor: "text-tertiary-500",
		visible: () => showTenantsTile,
		permission: {
			contextId: "config:settings",
			name: "Tenant Management",
			description: "Manage multi-tenant workspaces and provisioning",
			requiredRole: "admin",
			action: "manage",
			contextType: "system",
		},
	},
	{
		id: "appearance",
		href: "/config/appearance",
		label: "Appearance",
		icon: "mdi:palette-outline",
		iconColor: "",
		permission: {
			contextId: "config:appearance",
			name: "Appearance",
			description: "Admin theme, density, and visual customization",
			requiredRole: "admin",
			action: "manage",
			contextType: "configuration",
		},
	},
	{
		id: "designSystem",
		href: "/config/design-system",
		label: "Design System",
		icon: "mdi:compass-outline",
		iconColor: "text-tertiary-500",
		permission: {
			contextId: "config:appearance",
			name: "Design System",
			description: "Interactive native UI component playground",
			requiredRole: "admin",
			action: "view",
			contextType: "configuration",
		},
	},
	{
		id: "monitor",
		href: "/config/monitor",
		label: "System Monitor",
		icon: "mdi:shield-check-outline",
		iconColor: "",
		permission: {
			contextId: "config:systemMonitor",
			name: "System Monitor",
			description: "Health dashboard, audit log, and plugin status",
			requiredRole: "admin",
			action: "view",
			contextType: "system",
		},
	},
	// ── Content ──
	{
		id: "collectionbuilder",
		href: "/config/collectionbuilder",
		label: "Collection Builder",
		icon: "fluent-mdl2:build-definition",
		iconColor: "",
		permission: {
			contextId: "config:collectionManagement",
			name: "Collection Builder",
			description: "Visual content-modeling and schema builder",
			requiredRole: "admin",
			action: "manage",
			contextType: "configuration",
		},
	},
	// ── Security ──
	{
		id: "accessManagement",
		href: "/config/access-management",
		label: "Access Management",
		icon: "mdi:account-group",
		iconColor: "text-error-500",
		permission: {
			contextId: "config:accessManagement",
			name: "Access Management",
			description: "Users, roles, permissions, and website tokens",
			requiredRole: "admin",
			action: "manage",
			contextType: "configuration",
		},
	},
	// ── Extensions ──
	{
		id: "extensions",
		href: "/config/extensions",
		label: "Extensions",
		icon: "mdi:puzzle-outline",
		iconColor: "text-tertiary-500",
		permission: {
			contextId: "config:extensions",
			name: "Extensions",
			description: "Plugins, widgets, themes, and marketplace",
			requiredRole: "admin",
			action: "manage",
			contextType: "configuration",
		},
	},
	// ── Operations ──
	{
		id: "automations",
		href: "/config/automations",
		label: "Automations",
		icon: "mdi:robot-outline",
		iconColor: "text-warning-600",
		permission: {
			contextId: "config:automations",
			name: "Automations",
			description: "Event-driven workflow automations",
			requiredRole: "admin",
			action: "manage",
			contextType: "configuration",
		},
	},
	{
		id: "queue",
		href: "/config/queue",
		label: "Background Queue",
		icon: "mdi:playlist-play",
		iconColor: "",
		permission: {
			contextId: "config:queue",
			name: "Background Queue",
			description: "Monitor background jobs and retry failed tasks",
			requiredRole: "admin",
			action: "view",
			contextType: "system",
		},
	},
	{
		id: "sync",
		href: "/config/sync",
		label: "Data Sync",
		icon: "mdi:sync-circle",
		iconColor: "",
		permission: {
			contextId: "config:synchronization",
			name: "Data Sync",
			description: "Import content from external platforms and sync config to filesystem",
			requiredRole: "admin",
			action: "manage",
			contextType: "system",
		},
	},
	// ── Tools ──
	{
		id: "graphql",
		href: "/api/graphql",
		label: "GraphQL",
		icon: "teenyicons:graphql-solid",
		iconColor: "text-warning-600",
		target: "_blank",
		permission: {
			contextId: "api:graphql",
			name: "GraphQL",
			description: "Interactive GraphQL API playground",
			requiredRole: "developer",
			action: "access",
			contextType: "system",
		},
	},
	{
		id: "dashboard",
		href: "/dashboard",
		label: "Dashboard",
		icon: "bi:bar-chart-line",
		iconColor: "text-error-600",
		permission: {
			contextId: "system:dashboard",
			name: "Dashboard",
			description: "Content metrics and activity overview",
			requiredRole: "user",
			action: "access",
			contextType: "system",
		},
	},
	{
		id: "emailPreviews",
		href: "/email-previews",
		label: "Email Previews",
		icon: "mdi:email-outline",
		iconColor: "",
		target: "_blank",
		permission: {
			contextId: "system:admin",
			name: "Email Previews",
			description: "Preview transactional email templates",
			requiredRole: "admin",
			action: "access",
			contextType: "system",
		},
	},
	// ── TBD: features under review for final placement ──
	{
		id: "webhooks",
		href: "/config/webhooks",
		label: "Webhooks",
		icon: "mdi:webhook",
		iconColor: "text-warning-600",
		permission: {
			contextId: "config:webhooks",
			name: "Webhooks",
			description: "Outgoing HTTP callbacks on content events",
			requiredRole: "admin",
			action: "manage",
			contextType: "configuration",
		},
	},
	{
		id: "redirects",
		href: "/config/redirects",
		label: "Redirects",
		icon: "mdi:arrow-decision",
		iconColor: "text-tertiary-500",
		permission: {
			contextId: "config:redirects",
			name: "Redirects",
			description: "301/302 redirect rules with regex support",
			requiredRole: "admin",
			action: "manage",
			contextType: "configuration",
		},
	},
	{
		id: "trash",
		href: "/config/trash",
		label: "Trash",
		icon: "mdi:delete-restore",
		iconColor: "text-error-500 dark:text-error-400",
		permission: {
			contextId: "config:trash",
			name: "Trash",
			description: "Recover or permanently delete soft-deleted content",
			requiredRole: "admin",
			action: "manage",
			contextType: "configuration",
		},
	},
];
</script>

<AdminPageShell title="System Configuration" showBackButton={true} backUrl="/" icon="material-symbols:build-circle">
<div class="wrapper mb-2 max-h-[calc(100vh-65px)] overflow-auto p-2" in:fade={{ duration: 300 }}>
	<h2 class="h2 mb-4 text-center font-bold text-tertiary-600 dark:text-primary-500" in:fly={{ y: -10, duration: 300 }}>Manage your system configuration</h2>

	<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
		{#each configItems.filter((item) => !('visible' in item) || item.visible?.()) as item, idx (item.id || item.label)}
			{const usePermissionGuard = !!item.permission}

			{#if usePermissionGuard}
				<div in:fly={{ y: 20, delay: idx * 50, duration: 300 }}>
				<PermissionGuard {...({ config: item.permission } as any)}>
					<a
						href={item.href}
						class="flex h-24 flex-col items-center justify-center gap-2 rounded border border-surface-200 bg-white p-2 text-center shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:border-tertiary-500 hover:bg-primary-50 hover:shadow-xl  dark:bg-surface-800 dark:hover:border-tertiary-500 dark:border-primary-500 dark:hover:bg-surface-700 lg:h-32"
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
							class="w-full truncate text-xs font-medium uppercase tracking-wide group-hover:text-tertiary-600  dark:group-hover:text-tertiary-500 dark:text-primary-500 lg:text-sm"
						>
							{item.label}
						</p>
					</a>
				</PermissionGuard>
				</div>
			{:else}
				<div in:fly={{ y: 20, delay: idx * 50, duration: 300 }}>
				<a
					href={item.href}
					class="group flex h-24 flex-col items-center justify-center gap-2 rounded border border-surface-200 bg-white p-2 text-center shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:border-tertiary-500 hover:bg-primary-50 hover:shadow-xl  dark:bg-surface-800 dark:hover:border-tertiary-500 dark:border-primary-500 dark:hover:bg-surface-700 lg:h-32"
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
						class="w-full truncate text-xs font-medium uppercase tracking-wide text-surface-600 group-hover:text-tertiary-600 dark:text-primary-600 dark:group-hover:text-tertiary-500  lg:text-sm"
					>
						{item.label}
					</p>
				</a>
				</div>
			{/if}
		{/each}

		<!-- Plugin config_grid slots (each plugin supplies its own tile GUI) -->
		<div class="contents" in:fly={{ y: 20, delay: configItems.length * 50, duration: 300 }}>
			<PermissionGuard {...({
				config: {
				contextId: "config:extensions",
				name: "Plugin Extensions",
				description: "Plugin-owned config tiles and tools",
				requiredRole: "admin",
				action: "manage",
				contextType: "configuration",
			}} as any)}>
				<Slot
					name="config_grid"
					inline={true}
					props={{
						pluginStates: data?.pluginStates ?? {},
						isPro: false,
						enabled: data?.pluginStates?.['smart-importer'] ?? true,
					}}
				/>
			</PermissionGuard>
		</div>

		<Slot name="config" props={{ pluginStates: data?.pluginStates ?? {} }} />
	</div>
</div>
</AdminPageShell>
