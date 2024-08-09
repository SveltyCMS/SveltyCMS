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

	const { user } = $page.data;
	const roles = $page.data.roles || [];
	const rateLimits = $page.data.rateLimits || undefined;

	// Define permissions for different contexts
	const permissions: Record<string, PermissionConfig> = {
		systemSettings: {
			contextId: 'config/systemsetting',
			requiredRole: 'admin',
			action: 'read',
			contextType: 'system'
		},
		systemRoles: {
			contextId: 'config/systemRoles',
			requiredRole: 'admin',
			action: 'read',
			contextType: 'system'
		},
		widgetManagement: {
			contextId: 'config/widgetManagement',
			requiredRole: 'admin',
			action: 'read',
			contextType: 'system'
		},
		themeManagement: {
			contextId: 'config/themeManagement',
			requiredRole: 'admin',
			action: 'read',
			contextType: 'system'
		},
		accessManagement: {
			contextId: 'config/accessManagement',
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
	<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
		<!-- Collection -->
		<a href="/collection" class="config-btn variant-outline-tertiary dark:variant-outline-secondary" aria-label={m.config_systembuilder()}>
			<iconify-icon icon="fluent-mdl2:build-definition" class="config-icon text-tertiary-600" />
			<p class="config-text">{m.config_systembuilder()}</p>
		</a>

		<!-- Graphql Api -->
		<a
			href="/api/graphql"
			target="_blank"
			rel="noopener noreferrer"
			class="config-btn variant-outline-tertiary dark:variant-outline-secondary"
			aria-label={m.config_graphql()}
		>
			<iconify-icon icon="teenyicons:graphql-solid" class="config-icon text-warning-600" />
			<p class="config-text">{m.config_graphql()}</p>
		</a>

		<!-- Editor -->
		<a href="/imageEditor" class="config-btn variant-outline-tertiary dark:variant-outline-secondary" aria-label={m.config_imageeditor()}>
			<iconify-icon icon="bi:image" class="config-icon text-primary-600" />
			<p class="config-text">{m.config_imageeditor()}</p>
		</a>

		<!-- Dashboard -->
		<a href="/dashboard" class="config-btn variant-outline-tertiary dark:variant-outline-secondary" aria-label={m.config_Dashboard()}>
			<iconify-icon icon="bi:bar-chart-line" class="config-icon text-error-600" />
			<p class="config-text">{m.config_Dashboard()}</p>
		</a>

		<!-- Market Place -->
		<a
			href="https://www.sveltyCMS.com"
			target="_blank"
			rel="noopener noreferrer"
			class="config-btn variant-ghost-primary"
			aria-label={m.config_Martketplace()}
		>
			<iconify-icon icon="icon-park-outline:shopping-bag" class="config-icon text-white" />
			<p class="config-text">{m.config_Martketplace()}</p>
		</a>

		<!-- Widget Management -->
		<PermissionGuard {user} {roles} {rateLimits} {...permissions.widgetManagement}>
			<a href="/config/widgetManagement" class="config-btn variant-ghost-primary">
				<iconify-icon icon="mdi:widgets" class="config-icon text-white" />
				<p class="config-text">Widget Management</p>
			</a>
		</PermissionGuard>

		<!-- Theme Management -->
		<PermissionGuard {user} {roles} {rateLimits} {...permissions.themeManagement}>
			<a href="/config/themeManagement" class="config-btn variant-ghost-primary">
				<iconify-icon icon="ph:layout" class="config-icon text-white" />
				<p class="config-text">Themes</p>
			</a>
		</PermissionGuard>

		<!-- Settings -->
		<PermissionGuard {user} {roles} {rateLimits} {...permissions.systemSettings}>
			<a href="/config/systemsetting" class="config-btn variant-ghost-error" aria-label="System Settings">
				<iconify-icon icon="uil:setting" class="config-icon text-white" />
				<p class="config-text">Settings</p>
			</a>
		</PermissionGuard>

		<!-- Access Management -->
		<PermissionGuard {user} {roles} {rateLimits} {...permissions.accessManagement}>
			<a href="/config/assessManagement" class="config-btn variant-ghost-error" aria-label="Access Management">
				<iconify-icon icon="mdi:account-group" class="config-icon text-white" />
				<p class="config-text">Access Management</p>
			</a>
		</PermissionGuard>
	</div>
</div>

<style lang="postcss">
	:global(.config-btn) {
		@apply flex h-24 flex-col items-center justify-center gap-2 p-4 text-center transition-all duration-200 ease-in-out hover:scale-105 lg:h-20;
	}
	:global(.config-icon) {
		@apply text-3xl lg:text-2xl;
	}
	:global(.config-text) {
		@apply w-full truncate text-xs font-medium uppercase lg:text-sm;
	}
</style>
