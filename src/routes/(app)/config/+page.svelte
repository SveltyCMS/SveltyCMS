<script lang="ts">
	// Store
	import { page } from '$app/stores';

	// Component
	import PageTitle from '@components/PageTitle.svelte';

	// ParaglideJS
	import {
		config_pagetitle,
		config_body,
		config_systembuilder,
		config_graphql,
		config_imageeditor,
		config_Dashboard,
		config_Martketplace
	} from '@src/paraglide/messages';

	// Auth
	import PermissionGuard from '@components/PermissionGuard.svelte';
	import type { PermissionConfig } from '@src/auth/types';

	const { user, roles, rateLimits } = $page.data;

	// Define permissions for different contexts
	const permissions: Record<string, PermissionConfig> = {
		systemSettings: {
			contextId: 'config/systemsetting',
			requiredRole: 'admin',
			action: 'read',
			contextType: 'system'
		},
		systemRoles: {
			contextId: 'config/permissions/roles',
			requiredRole: 'admin',
			action: 'read',
			contextType: 'system'
		},
		systemPermissions: {
			contextId: 'config/permissions/permission',
			requiredRole: 'admin',
			action: 'read',
			contextType: 'system'
		},
		widgetManagement: {
			contextId: 'config/widgetManagement',
			requiredRole: 'admin',
			action: 'read',
			contextType: 'system'
		}
	};
</script>

<div class="my-2 flex items-center justify-between">
	<PageTitle name={config_pagetitle()} icon="" />
</div>

<div class="wrapper mb-2 max-h-[calc(100vh-65px)] overflow-auto">
	<h2 class="mb-4 text-center text-tertiary-600 dark:text-primary-500">{config_body()}</h2>
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
		<!-- Collection -->
		<a
			href="/collection"
			class="variant-outline-tertiary btn w-full gap-2 overflow-hidden py-6 dark:variant-outline-secondary"
			aria-label={config_systembuilder()}
		>
			<iconify-icon icon="fluent-mdl2:build-definition" width="24" class="text-tertiary-600" />
			<p class="overflow-hidden overflow-ellipsis uppercase">
				{config_systembuilder()}
			</p>
		</a>

		<!-- Graphql Api -->
		<a
			href="/api/graphql"
			target="_blank"
			rel="noopener noreferrer"
			class="variant-outline-tertiary btn w-full gap-2 py-6 dark:variant-outline-secondary"
			aria-label={config_graphql()}
		>
			<iconify-icon icon="teenyicons:graphql-solid" width="24" class="text-warning-600" />
			<p class="uppercase">
				{config_graphql()}
			</p>
		</a>

		<!-- Editor -->
		<a href="/imageEditor" class="variant-outline-tertiary btn w-full gap-2 py-6 dark:variant-outline-secondary" aria-label={config_imageeditor()}>
			<iconify-icon icon="bi:images" width="24" class="text-primary-600" />
			<p class="uppercase">
				{config_imageeditor()}
			</p>
		</a>

		<!-- Dashboard -->
		<a href="/dashboard" class="variant-outline-tertiary btn w-full gap-2 py-6 dark:variant-outline-secondary" aria-label={config_Dashboard()}>
			<iconify-icon icon="bi:images" width="24" class="text-error-600" />
			<p class="uppercase">{config_Dashboard()}</p>
		</a>

		<!-- Market Place -->
		<a
			href="https://www.sveltyCMS.com"
			target="_blank"
			rel="noopener noreferrer"
			class="variant-ghost-primary btn w-full gap-2 py-6"
			aria-label={config_Martketplace()}
		>
			<iconify-icon icon="icon-park-outline:shopping-bag" width="28" class="text-white" />
			<p class="uppercase">{config_Martketplace()}</p>
		</a>

		<!-- System Settings -->
		<PermissionGuard {user} {roles} {rateLimits} {...permissions.systemSettings}>
			<a href="/config/systemsetting" class="variant-ghost-error btn w-full gap-2 py-6" aria-label="System Settings">
				<iconify-icon icon="uil:setting" width="28" class="text-white" />
				<p class="uppercase">System Settings</p>
			</a>
		</PermissionGuard>

		<!-- System Roles -->
		<PermissionGuard {user} {roles} {rateLimits} {...permissions.systemRoles}>
			<a href="/config/permissions/roles" class="variant-ghost-error btn w-full gap-2 py-6" aria-label="System Roles">
				<iconify-icon icon="uil:setting" width="28" class="text-white" />
				<p class="uppercase">System Roles</p>
			</a>
		</PermissionGuard>

		<!-- System Permissions -->
		<PermissionGuard {user} {roles} {rateLimits} {...permissions.systemPermissions}>
			<a href="/config/permissions/permission" class="variant-ghost-error btn w-full gap-2 py-6" aria-label="System Permissions">
				<iconify-icon icon="uil:setting" width="28" class="text-white" />
				<p class="uppercase">System Permissions</p>
			</a>
		</PermissionGuard>

		<!-- Widget Management -->
		<PermissionGuard {user} {roles} {rateLimits} {...permissions.widgetManagement}>
			<a href="/config/widgetManagement" class="variant-ghost-secondary btn w-full gap-2 py-6">
				<iconify-icon icon="mdi:widgets" width="28" class="text-white" />
				<p class="uppercase">Widget Management</p>
			</a>
		</PermissionGuard>
	</div>
</div>
