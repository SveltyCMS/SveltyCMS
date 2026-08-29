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
	import HelpIcon from '@components/ui/help-icon.svelte';
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
		setup_system_demo_mode,
		setup_system_demo_mode_desc,
		setup_system_multi_tenant,
		setup_system_multi_tenant_desc,
		setup_email_from,
		setup_email_host,
		setup_email_port,
		setup_email_user
	} from '@src/paraglide/messages';
	// Types from setupStore
	import type { AdminUser, DbConfig, EmailSettings, SystemSettings } from '@src/stores/setup-store.svelte.ts';
	import { PRESETS } from './presets';

	//  props
	//  props
	interface Props {
		adminUser: AdminUser;
		dbConfig: DbConfig;
		systemSettings: SystemSettings;
		emailSettings: EmailSettings;
	}

	const { dbConfig, adminUser, systemSettings, emailSettings }: Props = $props();

	// Derive preset collection names for the review page
	const presetCollections = $derived(
		(() => {
			if (!systemSettings.preset || systemSettings.preset === 'blank') return [];
			const preset = PRESETS.find((p) => p.id === systemSettings.preset);
			return preset?.collections?.map((c) => c.label || c.name) ?? [];
		})(),
	);

	// Redaction helper (masking)
	function redact(value: string | undefined): string {
		if (!value) return '-';
		if (value.length <= 4) return '****';
		return value.substring(0, 2) + '••••' + value.substring(value.length - 2);
	}
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
					<h3 class="mb-3 flex items-center font-semibold tracking-tight text-surface-900 dark:text-surface-50">
						<iconify-icon icon="mdi:database" width="24" class="me-2 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						{setup_review_section_database?.() || 'Database Configuration'}
					</h3>
					<dl class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
						<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
							{setup_label_database_type ? setup_label_database_type() : 'Type'}:
							<SystemTooltip title={setup_help_database_type?.() || 'Database type'}>
								<HelpIcon ariaLabel="Help for Database Type" />
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{dbConfig.type}</dd>

						{#if dbConfig.host}
							<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
								{label_host?.() || 'Host'}:
								<SystemTooltip title={setup_help_database_host?.() || 'Database host'}>
									<HelpIcon ariaLabel="Help for Database Host" />
								</SystemTooltip>
							</dt>
							<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{redact(dbConfig.host)}</dd>
						{/if}

						{#if dbConfig.port}
							<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
								{label_port?.() || 'Port'}:
								<SystemTooltip title={setup_help_database_port?.() || 'Database port'}>
									<HelpIcon ariaLabel="Help for Database Port" />
								</SystemTooltip>
							</dt>
							<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{dbConfig.port}</dd>
						{/if}

						{#if dbConfig.name}
							<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
								{label_database?.() || 'Database'}:
								<SystemTooltip title={setup_help_database_name?.() || 'Database name'}>
									<HelpIcon ariaLabel="Help for Database Name" />
								</SystemTooltip>
							</dt>
							<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{dbConfig.name}</dd>
						{/if}

						{#if dbConfig.user}
							<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
								{form_username()}:
								<SystemTooltip title={setup_help_database_user?.() || 'Database username'}>
									<HelpIcon ariaLabel="Help for Database Username" />
								</SystemTooltip>
							</dt>
							<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{redact(dbConfig.user)}</dd>
						{/if}
					</dl>
				</div>

				<!-- Administrator Account -->
				<div>
					<h3 class="mb-3 flex items-center font-semibold tracking-tight text-surface-900 dark:text-surface-50">
						<iconify-icon icon="mdi:account" width="24" class="me-2 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						{setup_review_section_admin?.() || 'Administrator Account'}
					</h3>
					<dl class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
						<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
							{form_username()}:
							<SystemTooltip title={setup_help_admin_username?.() || 'Admin username'}>
								<HelpIcon ariaLabel="Help for Admin Username" />
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{adminUser.username}</dd>
						<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
							{form_email()}:
							<SystemTooltip title={setup_help_admin_email?.() || 'Admin email'}>
								<HelpIcon ariaLabel="Help for Admin Email" />
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{redact(adminUser.email)}</dd>
						<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
							{form_password()}:
							<SystemTooltip title={setup_help_admin_password?.() || 'Admin password'}>
								<HelpIcon ariaLabel="Help for Admin Password" />
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold text-lg leading-none pt-1">••••••••</dd>
					</dl>
				</div>

				<!-- Media Storage -->
				<div>
					<h3 class="mb-3 flex items-center font-semibold tracking-tight text-surface-900 dark:text-surface-50">
						<iconify-icon icon="mdi:folder" width="24" class="me-2 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						{setup_review_section_media?.() || 'Media Storage'}
					</h3>
					<dl class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
						<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
							Storage Type:
							<SystemTooltip title={setup_help_media_path?.() || 'The storage mechanism for user uploads.'}>
								<HelpIcon ariaLabel="Help for Storage Type" />
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
						<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
							{systemSettings.mediaStorageType === 'local' ? 'Folder Path' : 'Bucket Name'}:
							<SystemTooltip
								title="For local storage: specify the folder path (e.g., ./mediaFolder). For cloud storage: enter the bucket or container name."
							>
								<HelpIcon ariaLabel="Help for Media Folder" />
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{systemSettings.mediaFolder}</dd>
					</dl>
				</div>

				<!-- Email Configuration (SMTP) -->
				<div>
					<h3 class="mb-3 flex items-center font-semibold tracking-tight text-surface-900 dark:text-surface-50">
						<iconify-icon icon="mdi:email" width="24" class="me-2 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						Email Configuration
					</h3>
					<dl class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
						<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
							Status:
							<SystemTooltip title="Shows if the SMTP configuration was successfully tested and saved, or skipped.">
								<HelpIcon ariaLabel="Help for Email Status" />
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">
							{emailSettings.smtpConfigured ? '✅ Configured' : '❌ Not Configured (Skipped)'}
						</dd>

						{#if emailSettings.smtpConfigured}
							<dt class="flex items-center font-medium text-surface-900 dark:text-surface-50">
								{setup_email_host()}:
							</dt>
							<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{redact(emailSettings.host)}</dd>

							<dt class="flex items-center font-medium text-surface-900 dark:text-surface-50">
								{setup_email_port()}:
							</dt>
							<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{emailSettings.port}</dd>

							<dt class="flex items-center font-medium text-surface-900 dark:text-surface-50">
								{setup_email_user()}:
							</dt>
							<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{redact(emailSettings.user)}</dd>

							<dt class="flex items-center font-medium text-surface-900 dark:text-surface-50">
								{setup_email_from()}:
							</dt>
							<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{redact(emailSettings.from || emailSettings.user)}</dd>
						{/if}
					</dl>
				</div>
			</div>

			<!-- Right Column: System Settings -->
			<div class="space-y-4">
				<!-- System Settings -->
				<div>
					<h3 class="mb-3 flex items-center font-semibold tracking-tight text-surface-900 dark:text-surface-50">
						<iconify-icon icon="mdi:cog" width="24" class="me-2 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						{setup_review_section_system?.() || 'System Settings'}
					</h3>
					<dl class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
						<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
							CMS Name:
							<SystemTooltip title={setup_help_site_name?.() || 'The name for your CMS instance.'}>
								<HelpIcon ariaLabel="Help for Site Name" />
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{systemSettings.siteName}</dd>

						<!-- Added missing preset -->
						<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
							Project Blueprint:
							<SystemTooltip title="The selected project blueprint/preset.">
								<HelpIcon ariaLabel="Help for Project Blueprint" />
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{systemSettings.preset}</dd>
						{#if presetCollections.length > 0}
							<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
								Creates:
							</dt>
							<dd class="text-tertiary-500 dark:text-primary-500 text-sm">{presetCollections.join(', ')}</dd>
						{/if}

						<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
							Production URL:
							<SystemTooltip
								title="The production URL where your CMS will be accessible (e.g., https://mysite.com). Used for OAuth callbacks and email links."
							>
								<HelpIcon ariaLabel="Help for Production URL" />
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{systemSettings.hostProd}</dd>
						<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
							{setup_review_label_default_system_lang?.() || 'Default System Lang'}:
							<SystemTooltip title={setup_help_default_system_language?.() || 'Primary language for the admin interface.'}>
								<HelpIcon ariaLabel="Help for Default System Language" />
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold uppercase">{systemSettings.defaultSystemLanguage}</dd>
						<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
							{setup_review_label_system_languages?.() || 'System Languages'}:
							<SystemTooltip title={setup_help_system_languages?.() || 'Available languages for the admin interface.'}>
								<HelpIcon ariaLabel="Help for System Languages" />
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold uppercase">{systemSettings.systemLanguages.join(', ')}</dd>
						<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
							{setup_review_label_default_content_lang?.() || 'Default Content Lang'}:
							<SystemTooltip title={setup_help_default_content_language?.() || 'Primary language for content creation.'}>
								<HelpIcon ariaLabel="Help for Default Content Language" />
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold uppercase">{systemSettings.defaultContentLanguage}</dd>
						<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
							{setup_review_label_content_languages?.() || 'Content Languages'}:
							<SystemTooltip title={setup_help_content_languages?.() || 'Available languages for content translations.'}>
								<HelpIcon ariaLabel="Help for Content Languages" />
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold uppercase">{systemSettings.contentLanguages.join(', ')}</dd>
						<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
							{setup_review_label_timezone?.() || 'Timezone'}:
							<SystemTooltip title="The default timezone for the system. Used for scheduling and date displays.">
								<HelpIcon ariaLabel="Help for Timezone" />
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{systemSettings.timezone}</dd>
						<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
							{setup_system_multi_tenant?.() || 'Multi-Tenant Mode'}:
							<SystemTooltip title={setup_system_multi_tenant_desc?.() || 'Enables support for multiple isolated tenants on a single installation.'}>
								<HelpIcon ariaLabel="Help for Multi-Tenant Mode" />
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{systemSettings.multiTenant ? 'Enabled' : 'Disabled'}</dd>

						<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
							{setup_system_demo_mode?.() || 'Demo Mode'}:
							<SystemTooltip
								title={setup_system_demo_mode_desc?.() || 'Warning: Creates ephemeral environments for visitors. Data is wiped automatically.'}
							>
								<HelpIcon ariaLabel="Help for Demo Mode" />
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{systemSettings.demoMode ? 'Enabled' : 'Disabled'}</dd>

						<dt
							class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50 border-t border-surface-100 dark:border-surface-500/40 pt-1 mt-1"
						>
							Redis Caching:
							<SystemTooltip title="In-memory caching for database queries and session data.">
								<HelpIcon ariaLabel="Help for Redis Caching" />
							</SystemTooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500 border-t border-surface-100 dark:border-surface-500/40 pt-1 mt-1 font-semibold">
							{systemSettings.useRedis ? '🚀 Enabled' : 'Disabled'}
						</dd>

						{#if systemSettings.useRedis}
							<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50">
								Redis Host:
								<SystemTooltip title="The connection address and port for your Redis instance.">
									<HelpIcon ariaLabel="Help for Redis Host" />
								</SystemTooltip>
							</dt>
							<dd class="text-tertiary-500 dark:text-primary-500 font-semibold">{systemSettings.redisHost}:{systemSettings.redisPort}</dd>
						{/if}

						{#if systemSettings.cfApiToken}
							<dt
								class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50 border-t border-surface-100 dark:border-surface-500/40 pt-1 mt-1"
							>
								Cloudflare CDN:
								<SystemTooltip title="Native Cloudflare CDN integration for edge purging.">
									<HelpIcon ariaLabel="Help for Cloudflare CDN" />
								</SystemTooltip>
							</dt>
							<dd class="text-tertiary-500 dark:text-primary-500 border-t border-surface-100 dark:border-surface-500/40 pt-1 mt-1 font-semibold">
								🚀 {systemSettings.cfZoneId ? 'Active' : 'Partial (Missing Zone ID)'}
							</dd>
							{#if systemSettings.cfZoneId}
								<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50 ps-4 text-xs opacity-70">
									Zone ID:
								</dt>
								<dd class="text-tertiary-500 dark:text-primary-500 font-mono text-xs">{redact(systemSettings.cfZoneId)}</dd>
							{/if}
							<dt class="flex items-center justify-between font-medium text-surface-900 dark:text-surface-50 ps-4 text-xs opacity-70">
								Purge Strategy:
							</dt>
							<dd class="text-tertiary-500 dark:text-primary-500 text-xs">
								{systemSettings.cfPurgeMode === 'tags' ? 'Surgical (Cache Tags)' : 'Full Purge (Everything)'}
							</dd>
						{/if}
					</dl>
				</div>
			</div>
		</div>
	</div>
</div>
