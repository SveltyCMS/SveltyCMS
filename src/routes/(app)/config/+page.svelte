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
	import type { User, Role, RateLimit, PermissionAction } from '@src/auth/types';
	import { addPermission, hasPermission } from '@src/auth/permissionManager';

	const user: User = $page.data.user;
	const roles: Role[] = $page.data.roles;
	const rateLimits: RateLimit[] = $page.data.rateLimits;

	// Define the necessary context and action
	const systemSettingsPermission: { contextId: string; requiredRole: string; action: PermissionAction; contextType: 'collection' | 'widget' } = {
		contextId: 'config/systemsetting',
		requiredRole: 'admin',
		action: 'read',
		contextType: 'collection' // or 'widget', depending on your actual use case
	};

	// Add permission dynamically
	addPermission(
		systemSettingsPermission.contextId,
		systemSettingsPermission.action,
		systemSettingsPermission.requiredRole,
		systemSettingsPermission.contextType
	);

	// Check if the user has the required permission
	const userHasPermission = hasPermission(user, roles, systemSettingsPermission.action, systemSettingsPermission.contextId, rateLimits);
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
		{#if userHasPermission}
			<a href="/config/systemsetting" class="variant-ghost-error btn w-full gap-2 py-6" aria-label="System Settings">
				<iconify-icon icon="uil:setting" width="28" class="text-white" />
				<p class="uppercase">System Settings</p>
			</a>
		{/if}
	</div>
</div>
