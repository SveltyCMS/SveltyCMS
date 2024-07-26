<script lang="ts">
	// Store
	import { page } from '$app/stores';

	// Component
	import PageTitle from '@components/PageTitle.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

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
	<PageTitle name={m.config_pagetitle()} icon="" />
</div>

<div class="wrapper mb-2 max-h-[calc(100vh-65px)] overflow-auto">
	<h2 class="mb-4 text-center text-tertiary-600 dark:text-primary-500">{m.config_body()}</h2>
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
		<!-- Collection -->
		<a
			href="/collection"
			class="variant-outline-tertiary btn w-full gap-2 overflow-hidden py-6 dark:variant-outline-secondary"
			aria-label={m.config_systembuilder()}
		>
			<iconify-icon icon="fluent-mdl2:build-definition" width="24" class="text-tertiary-600" />
			<p class="overflow-hidden overflow-ellipsis uppercase">
				{m.config_systembuilder()}
			</p>
		</a>

		<!-- Graphql Api -->
		<a
			href="/api/graphql"
			target="_blank"
			rel="noopener noreferrer"
			class="variant-outline-tertiary btn w-full gap-2 py-6 dark:variant-outline-secondary"
			aria-label={m.config_graphql()}
		>
			<iconify-icon icon="teenyicons:graphql-solid" width="24" class="text-warning-600" />
			<p class="uppercase">
				{m.config_graphql()}
			</p>
		</a>

		<!-- Editor -->
		<a href="/imageEditor" class="variant-outline-tertiary btn w-full gap-2 py-6 dark:variant-outline-secondary" aria-label={m.config_imageeditor()}>
			<iconify-icon icon="bi:image" width="24" class="text-primary-600" />
			<p class="uppercase">
				{m.config_imageeditor()}
			</p>
		</a>

		<!-- Dashboard -->
		<a href="/dashboard" class="variant-outline-tertiary btn w-full gap-2 py-6 dark:variant-outline-secondary" aria-label={m.config_Dashboard()}>
			<iconify-icon icon="bi:bar-chart-line" width="24" class="text-error-600" />
			<p class="uppercase">{m.config_Dashboard()}</p>
		</a>

		<!-- Market Place -->
		<a
			href="https://www.sveltyCMS.com"
			target="_blank"
			rel="noopener noreferrer"
			class="variant-ghost-primary btn w-full gap-2 py-6"
			aria-label={m.config_Martketplace()}
		>
			<iconify-icon icon="icon-park-outline:shopping-bag" width="28" class="text-white" />
			<p class="uppercase">{m.config_Martketplace()}</p>
		</a>

		<!-- Widget Management -->
		<PermissionGuard {user} {roles} {rateLimits} {...permissions.widgetManagement}>
			<a href="/config/widgetManagement" class="variant-ghost-primary btn w-full gap-2 py-6">
				<iconify-icon icon="mdi:widgets" width="28" class="text-white" />
				<p class="uppercase">Widget Management</p>
			</a>
		</PermissionGuard>

		<!-- Theme Management -->
		<PermissionGuard {user} {roles} {rateLimits} {...permissions.widgetManagement}>
			<a href="/config/themeManagement" class="variant-ghost-primary btn w-full gap-2 py-6">
				<iconify-icon icon="ph:layout" width="28" class="text-white" />
				<p class="uppercase">Themes</p>
			</a>
		</PermissionGuard>

		<!-- Settings -->
		<PermissionGuard {user} {roles} {rateLimits} {...permissions.systemSettings}>
			<a href="/config/systemsetting" class="variant-ghost-error btn w-full gap-2 py-6" aria-label="System Settings">
				<iconify-icon icon="uil:setting" width="28" class="text-white" />
				<p class="uppercase">Settings</p>
			</a>
		</PermissionGuard>

		<!-- Roles -->
		<PermissionGuard {user} {roles} {rateLimits} {...permissions.systemRoles}>
			<a href="/config/roles" class="variant-ghost-error btn w-full gap-2 py-6" aria-label="System Roles">
				<iconify-icon icon="mdi:account-group" width="28" class="text-white" />
				<p class="uppercase">Roles</p>
			</a>
		</PermissionGuard>

		<!-- Permissions -->
		<PermissionGuard {user} {roles} {rateLimits} {...permissions.systemPermissions}>
			<a href="/config/permission" class="variant-ghost-error btn w-full gap-2 py-6" aria-label="System Permissions">
				<iconify-icon icon="mdi:shield-lock-outline" width="28" class="text-white" />
				<p class="uppercase">Permissions</p>
			</a>
		</PermissionGuard>
	</div>
</div>
