<!--
@file src/routes/setup/ReviewConfig.svelte
@summary
SveltyCMS Setup Wizard – Review & Complete Step

This component presents a summary of all configuration steps before finalizing the SveltyCMS setup. It allows the user to:
- Review database configuration
- Review administrator account details
- Review system settings (site name, language, timezone, media folder)
- Confirm all information before completing setup

Key Features:
- Uses Svelte 5 runes for state management
- TypeScript for type safety
- Skeleton UI for consistent styling
- Designed for integration as the final step in a multi-step setup wizard
-->
<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	// Props passed from parent setup page
	export let dbConfig: { type: string; host?: string; port?: string; name?: string; user?: string };
	export let adminUser: { username: string; email: string; password: string; confirmPassword: string };
	export let systemSettings: {
		siteName: string;
		defaultSystemLanguage: string;
		systemLanguages: string[];
		defaultContentLanguage: string;
		contentLanguages: string[];
		mediaFolder: string;
		timezone: string;
	};
</script>

<div class="fade-in">
	<!-- Review & Complete -->
	<div class="mb-8">
		<p class="text-sm text-tertiary-500 dark:text-primary-500 sm:text-base">
			{m.setup_review_intro?.() ||
				"Please review your configuration before completing the setup. Once finished, you'll be redirected to the login page."}
		</p>
	</div>

	<div class="space-y-6">
		<div class="mt-4 space-y-6 rounded border border-indigo-100 bg-white p-4 shadow-xl dark:bg-surface-500">
			<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
				<div>
					<h3 class="mb-3 flex items-center font-semibold tracking-tight">
						<iconify-icon icon="mdi:database" width="20" class="mr-2 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						{m.setup_review_section_database?.() || 'Database Configuration'}
					</h3>
					<!-- Consistent two-column grid for aligned values -->
					<dl class="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1 text-sm">
						<dt class="font-medium">{m.setup_label_database_type ? m.setup_label_database_type() : 'Type:'}</dt>
						<dd class="text-tertiary-500 dark:text-primary-500">{dbConfig.type}:</dd>
						{#if dbConfig.host}<dt class="font-medium">{m.label_host?.() || 'Host'}:</dt>
							<dd class="text-tertiary-500 dark:text-primary-500">{dbConfig.host}</dd>{/if}
						{#if dbConfig.port}<dt class="font-medium">{m.label_port?.() || 'Port'}:</dt>
							<dd class="text-tertiary-500 dark:text-primary-500">{dbConfig.port}</dd>{/if}
						{#if dbConfig.name}<dt class="font-medium">{m.label_database?.() || 'Database'}:</dt>
							<dd class="text-tertiary-500 dark:text-primary-500">{dbConfig.name}</dd>{/if}
						{#if dbConfig.user}<dt class="font-medium">{m.form_username()}:</dt>
							<dd class="text-tertiary-500 dark:text-primary-500">{dbConfig.user}</dd>{/if}
					</dl>
				</div>

				<div>
					<h3 class="mb-3 flex items-center font-semibold tracking-tight">
						<iconify-icon icon="mdi:account" width="20" class="mr-2 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						{m.setup_review_section_admin?.() || 'Administrator Account'}
					</h3>
					<dl class="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1 text-sm">
						<dt class="font-medium">{m.form_username()}:</dt>
						<dd class="text-tertiary-500 dark:text-primary-500">{adminUser.username}</dd>
						<dt class="font-medium">{m.form_email()}:</dt>
						<dd class="text-tertiary-500 dark:text-primary-500">{adminUser.email}</dd>
						<dt class="font-medium">{m.form_password()}:</dt>
						<dd class="text-tertiary-500 dark:text-primary-500">••••••••</dd>
					</dl>
				</div>

				<div>
					<h3 class="mb-3 flex items-center font-semibold tracking-tight">
						<iconify-icon icon="mdi:cog" width="20" class="mr-2 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						{m.setup_review_section_system?.() || 'System Settings'}
					</h3>
					<dl class="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1 text-sm">
						<dt class="font-medium">{m.setup_system_site_name?.() || 'Site Name'}:</dt>
						<dd class="text-tertiary-500 dark:text-primary-500">{systemSettings.siteName}</dd>
						<dt class="font-medium">{m.setup_review_label_default_system_lang?.() || 'Default System Lang'}:</dt>
						<dd class="text-tertiary-500 dark:text-primary-500">{systemSettings.defaultSystemLanguage}</dd>
						<dt class="font-medium">{m.setup_review_label_system_languages?.() || 'System Languages'}:</dt>
						<dd class="text-tertiary-500 dark:text-primary-500">{systemSettings.systemLanguages.join(', ')}</dd>
						<dt class="font-medium">{m.setup_review_label_default_content_lang?.() || 'Default Content Lang'}:</dt>
						<dd class="text-tertiary-500 dark:text-primary-500">{systemSettings.defaultContentLanguage}</dd>
						<dt class="font-medium">{m.setup_review_label_content_languages?.() || 'Content Languages'}:</dt>
						<dd class="text-tertiary-500 dark:text-primary-500">{systemSettings.contentLanguages.join(', ')}</dd>
						<dt class="font-medium">{m.setup_review_label_timezone?.() || 'Timezone'}:</dt>
						<dd class="text-tertiary-500 dark:text-primary-500">{systemSettings.timezone}</dd>
					</dl>
				</div>

				<div>
					<h3 class="mb-3 flex items-center font-semibold tracking-tight">
						<iconify-icon icon="mdi:folder" width="20" class="mr-2 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						{m.setup_review_section_media?.() || 'Media Storage'}
					</h3>
					<dl class="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1 text-sm">
						<dt class="font-medium">{m.setup_review_label_path?.() || 'Path'}:</dt>
						<dd class="text-tertiary-500 dark:text-primary-500">{systemSettings.mediaFolder}</dd>
					</dl>
				</div>
			</div>
		</div>
	</div>
</div>
