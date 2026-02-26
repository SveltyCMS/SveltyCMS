<!--
@file src/routes/setup/ReviewConfig.svelte
@summary
SveltyCMS Setup Wizard – Review & Complete Step

This component presents a summary of all configuration steps before finalizing the SveltyCMS setup. It allows the user to:
- Review database configuration
- Review administrator account details
- Review system settings (site name, language, timezone, media folder)
- Confirm all information before completing setup


-->
<script lang="ts">
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	// ParaglideJS
	import {
		form_email,
		form_password,
		form_username,
		label_database,
		label_host,
		label_port,
		setup_help_admin_email,
		setup_help_admin_password,
		setup_help_admin_username,
		setup_help_content_languages,
		setup_help_database_host,
		setup_help_database_name,
		setup_help_database_port,
		setup_help_database_type,
		setup_help_database_user,
		setup_help_default_content_language,
		setup_help_default_system_language,
		setup_help_media_path,
		setup_help_site_name,
		setup_help_system_languages,
		setup_label_database_type,
		setup_review_intro,
		setup_review_label_content_languages,
		setup_review_label_default_content_lang,
		setup_review_label_default_system_lang,
		setup_review_label_system_languages,
		setup_review_label_timezone,
		setup_review_section_admin,
		setup_review_section_database,
		setup_review_section_media,
		setup_review_section_system,
		setup_system_demo_mode_desc,
		setup_system_multi_tenant_desc
	} from '@src/paraglide/messages';
	// Types from setupStore
	import type { AdminUser, DbConfig, SystemSettings } from '@src/stores/setup-store.svelte.ts';

	//  props
	interface Props {
		adminUser: AdminUser;
		dbConfig: DbConfig;
		systemSettings: SystemSettings;
	}

	const { dbConfig, adminUser, systemSettings }: Props = $props();
</script>

<div class="fade-in">
	<!-- Review & Complete -->
	<div class="mb-4">
		<p class="text-sm text-tertiary-500 dark:text-primary-500 sm:text-base">
			{setup_review_intro?.() ||
				"Please review your configuration before completing the setup. Once finished, you'll be redirected to the login page."}
		</p>
	</div>

	<div class="space-y-4">
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 items-start">
			<!-- Left Column: Database, Admin, Media -->
			<div class="space-y-4">
				<!-- Database Configuration -->
				<div>
					<h3 class="mb-3 flex items-center font-semibold tracking-tight text-black dark:text-white">
						<iconify-icon icon="mdi:database" width="24" class="mr-2 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						{setup_review_section_database?.() || 'Database Configuration'}
					</h3>
					<dl class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							{setup_label_database_type ? setup_label_database_type() : 'Type'}:
							<SystemTooltip title={setup_help_database_type?.() || 'Database type'}>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Database Type"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{dbConfig.type}</dd>

						{#if dbConfig.host}
							<dt class="flex items-center justify-between font-medium text-black dark:text-white">
								{label_host?.() || 'Host'}:
								<SystemTooltip title={setup_help_database_host?.() || 'Database host'}>
									<button
										type="button"
										tabindex="-1"
										class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
										aria-label="Help for Database Host"
									>
										<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
									</button>
								</SystemTooltip>
							</dt>
							<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{dbConfig.host}</dd>
						{/if}

						{#if dbConfig.port}
							<dt class="flex items-center justify-between font-medium text-black dark:text-white">
								{label_port?.() || 'Port'}:
								<SystemTooltip title={setup_help_database_port?.() || 'Database port'}>
									<button
										type="button"
										tabindex="-1"
										class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
										aria-label="Help for Database Port"
									>
										<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
									</button>
								</SystemTooltip>
							</dt>
							<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{dbConfig.port}</dd>
						{/if}

						{#if dbConfig.name}
							<dt class="flex items-center justify-between font-medium text-black dark:text-white">
								{label_database?.() || 'Database'}:
								<SystemTooltip title={setup_help_database_name?.() || 'Database name'}>
									<button
										type="button"
										tabindex="-1"
										class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
										aria-label="Help for Database Name"
									>
										<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
									</button>
								</SystemTooltip>
							</dt>
							<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{dbConfig.name}</dd>
						{/if}

						{#if dbConfig.user}
							<dt class="flex items-center justify-between font-medium text-black dark:text-white">
								{form_username()}:
								<SystemTooltip title={setup_help_database_user?.() || 'Database username'}>
									<button
										type="button"
										tabindex="-1"
										class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
										aria-label="Help for Database Username"
									>
										<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
									</button>
								</SystemTooltip>
							</dt>
							<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{dbConfig.user}</dd>
						{/if}
					</dl>
				</div>

				<!-- Administrator Account -->
				<div>
					<h3 class="mb-3 flex items-center font-semibold tracking-tight text-black dark:text-white">
						<iconify-icon icon="mdi:account" width="24" class="mr-2 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						{setup_review_section_admin?.() || 'Administrator Account'}
					</h3>
					<dl class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							{form_username()}:
							<SystemTooltip title={setup_help_admin_username?.() || 'Admin username'}>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Admin Username"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{adminUser.username}</dd>
						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							{form_email()}:
							<SystemTooltip title={setup_help_admin_email?.() || 'Admin email'}>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Admin Email"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{adminUser.email}</dd>
						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							{form_password()}:
							<SystemTooltip title={setup_help_admin_password?.() || 'Admin password'}>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Admin Password"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold text-lg leading-none pt-1">••••••••</dd>
					</dl>
				</div>

				<!-- Media Storage -->
				<div>
					<h3 class="mb-3 flex items-center font-semibold tracking-tight text-black dark:text-white">
						<iconify-icon icon="mdi:folder" width="24" class="mr-2 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						{setup_review_section_media?.() || 'Media Storage'}
					</h3>
					<dl class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							Storage Type:
							<SystemTooltip title={setup_help_media_path?.() || 'The storage mechanism for user uploads.'}>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Storage Type"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500">
							{#if systemSettings.mediaStorageType === 'local'}
								📁 Local Storage
							{:else if systemSettings.mediaStorageType === 's3'}
								☁️ Amazon S3
							{:else if systemSettings.mediaStorageType === 'r2'}
								☁️ Cloudflare R2
							{:else if systemSettings.mediaStorageType === 'cloudinary'}
								☁️ Cloudinary
							{/if}
						</dd>
						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							{systemSettings.mediaStorageType === 'local' ? 'Folder Path' : 'Bucket Name'}:
							<SystemTooltip
								title="For local storage: specify the folder path (e.g., ./mediaFolder). For cloud storage: enter the bucket or container name."
							>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Media Folder"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{systemSettings.mediaFolder}</dd>
					</dl>
				</div>
			</div>

			<!-- Right Column: System Settings -->
			<div class="space-y-4">
				<!-- System Settings -->
				<div>
					<h3 class="mb-3 flex items-center font-semibold tracking-tight text-black dark:text-white">
						<iconify-icon icon="mdi:cog" width="24" class="mr-2 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						{setup_review_section_system?.() || 'System Settings'}
					</h3>
					<dl class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							CMS Name:
							<SystemTooltip title={setup_help_site_name?.() || 'The name for your CMS instance.'}>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Site Name"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{systemSettings.siteName}</dd>

						<!-- Added missing preset -->
						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							Project Blueprint:
							<SystemTooltip title="The selected project blueprint/preset.">
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Project Blueprint"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{systemSettings.preset}</dd>

						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							Production URL:
							<SystemTooltip
								title="The production URL where your CMS will be accessible (e.g., https://mysite.com). Used for OAuth callbacks and email links."
							>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Production URL"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{systemSettings.hostProd}</dd>
						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							{setup_review_label_default_system_lang?.() || 'Default System Lang'}:
							<SystemTooltip title={setup_help_default_system_language?.() || 'Primary language for the admin interface.'}>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Default System Language"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold uppercase">{systemSettings.defaultSystemLanguage}</dd>
						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							{setup_review_label_system_languages?.() || 'System Languages'}:
							<SystemTooltip title={setup_help_system_languages?.() || 'Available languages for the admin interface.'}>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for System Languages"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold uppercase">{systemSettings.systemLanguages.join(', ')}</dd>
						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							{setup_review_label_default_content_lang?.() || 'Default Content Lang'}:
							<SystemTooltip title={setup_help_default_content_language?.() || 'Primary language for content creation.'}>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Default Content Language"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold uppercase">{systemSettings.defaultContentLanguage}</dd>
						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							{setup_review_label_content_languages?.() || 'Content Languages'}:
							<SystemTooltip title={setup_help_content_languages?.() || 'Available languages for content translations.'}>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Content Languages"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold uppercase">{systemSettings.contentLanguages.join(', ')}</dd>
						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							{setup_review_label_timezone?.() || 'Timezone'}:
							<SystemTooltip title="The default timezone for the system. Used for scheduling and date displays.">
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Timezone"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{systemSettings.timezone}</dd>
						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							Multi-Tenant Mode:
							<SystemTooltip title={setup_system_multi_tenant_desc?.() || 'Enables support for multiple isolated tenants on a single installation.'}>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Multi-Tenant Mode"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{systemSettings.multiTenant ? 'Enabled' : 'Disabled'}</dd>

						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							Demo Mode:
							<SystemTooltip
								title={setup_system_demo_mode_desc?.() || 'Warning: Creates ephemeral environments for visitors. Data is wiped automatically.'}
							>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Demo Mode"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{systemSettings.demoMode ? 'Enabled' : 'Disabled'}</dd>

						<dt
							class="flex items-center justify-between font-medium text-black dark:text-white border-t border-slate-100 dark:border-slate-800 pt-1 mt-1"
						>
							Redis Caching:
							<SystemTooltip title="In-memory caching for database queries and session data.">
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Redis Caching"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 border-t border-slate-100 dark:border-slate-800 pt-1 mt-1 font-semibold">
							{systemSettings.useRedis ? '🚀 Enabled' : 'Disabled'}
						</dd>

						{#if systemSettings.useRedis}
							<dt class="flex items-center justify-between font-medium text-black dark:text-white">Redis Host:</dt>
							<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{systemSettings.redisHost}:{systemSettings.redisPort}</dd>
						{/if}
					</dl>
				</div>
			</div>
		</div>
	</div>
</div>
