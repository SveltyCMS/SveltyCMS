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
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Types from setupStore
	import type { AdminUser, DbConfig, SystemSettings } from '@stores/setupStore.svelte';
	import { Tooltip, Portal } from '@skeletonlabs/skeleton-svelte';

	//  props
	interface Props {
		dbConfig: DbConfig;
		adminUser: AdminUser;
		systemSettings: SystemSettings;
	}

	const { dbConfig, adminUser, systemSettings }: Props = $props();
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
		<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
			<div>
				<h3 class="mb-3 flex items-center font-semibold tracking-tight text-black dark:text-white">
					<iconify-icon icon="mdi:database" width="24" class="mr-2 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					{m.setup_review_section_database?.() || 'Database Configuration'}
				</h3>
				<!-- Consistent two-column grid for aligned values -->
				<dl class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
					<dt class="flex items-center justify-between font-medium text-black dark:text-white">
						{m.setup_label_database_type ? m.setup_label_database_type() : 'Type'}:
						<Tooltip positioning={{ placement: 'top' }}>
							<Tooltip.Trigger>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Database Type"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</Tooltip.Trigger>
							<Portal>
								<Tooltip.Positioner>
									<Tooltip.Content
										class="card w-64 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
									>
										<p>{m.setup_help_database_type?.() || 'Database type'}</p>
										<Tooltip.Arrow
											class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
											><Tooltip.ArrowTip /></Tooltip.Arrow
										>
									</Tooltip.Content>
								</Tooltip.Positioner>
							</Portal>
						</Tooltip>
					</dt>
					<dd class="text-tertiary-500 dark:text-primary-500">{dbConfig.type}</dd>

					{#if dbConfig.host}
						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							{m.label_host?.() || 'Host'}:
							<Tooltip positioning={{ placement: 'top' }}>
								<Tooltip.Trigger>
									<button
										type="button"
										tabindex="-1"
										class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
										aria-label="Help for Database Host"
									>
										<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
									</button>
								</Tooltip.Trigger>
								<Portal>
									<Tooltip.Positioner>
										<Tooltip.Content
											class="card w-64 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
										>
											<p>{m.setup_help_database_host?.() || 'Database host'}</p>
											<Tooltip.Arrow
												class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
												><Tooltip.ArrowTip /></Tooltip.Arrow
											>
										</Tooltip.Content>
									</Tooltip.Positioner>
								</Portal>
							</Tooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500">{dbConfig.host}</dd>
					{/if}

					{#if dbConfig.port}
						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							{m.label_port?.() || 'Port'}:
							<Tooltip positioning={{ placement: 'top' }}>
								<Tooltip.Trigger>
									<button
										type="button"
										tabindex="-1"
										class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
										aria-label="Help for Database Port"
									>
										<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
									</button>
								</Tooltip.Trigger>
								<Portal>
									<Tooltip.Positioner>
										<Tooltip.Content
											class="card w-64 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
										>
											<p>{m.setup_help_database_port?.() || 'Database port'}</p>
											<Tooltip.Arrow
												class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
												><Tooltip.ArrowTip /></Tooltip.Arrow
											>
										</Tooltip.Content>
									</Tooltip.Positioner>
								</Portal>
							</Tooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500">{dbConfig.port}</dd>
					{/if}

					{#if dbConfig.name}
						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							{m.label_database?.() || 'Database'}:
							<Tooltip positioning={{ placement: 'top' }}>
								<Tooltip.Trigger>
									<button
										type="button"
										tabindex="-1"
										class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
										aria-label="Help for Database Name"
									>
										<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
									</button>
								</Tooltip.Trigger>
								<Portal>
									<Tooltip.Positioner>
										<Tooltip.Content
											class="card w-64 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
										>
											<p>{m.setup_help_database_name?.() || 'Database name'}</p>
											<Tooltip.Arrow
												class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
												><Tooltip.ArrowTip /></Tooltip.Arrow
											>
										</Tooltip.Content>
									</Tooltip.Positioner>
								</Portal>
							</Tooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500">{dbConfig.name}</dd>
					{/if}

					{#if dbConfig.user}
						<dt class="flex items-center justify-between font-medium text-black dark:text-white">
							{m.form_username()}:
							<Tooltip positioning={{ placement: 'top' }}>
								<Tooltip.Trigger>
									<button
										type="button"
										tabindex="-1"
										class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
										aria-label="Help for Database Username"
									>
										<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
									</button>
								</Tooltip.Trigger>
								<Portal>
									<Tooltip.Positioner>
										<Tooltip.Content
											class="card w-64 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
										>
											<p>{m.setup_help_database_user?.() || 'Database username'}</p>
											<Tooltip.Arrow
												class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
												><Tooltip.ArrowTip /></Tooltip.Arrow
											>
										</Tooltip.Content>
									</Tooltip.Positioner>
								</Portal>
							</Tooltip>
						</dt>
						<dd class="text-tertiary-500 dark:text-primary-500">{dbConfig.user}</dd>
					{/if}
				</dl>
			</div>

			<div>
				<h3 class="mb-3 flex items-center font-semibold tracking-tight text-black dark:text-white">
					<iconify-icon icon="mdi:account" width="24" class="mr-2 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					{m.setup_review_section_admin?.() || 'Administrator Account'}
				</h3>
				<dl class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
					<dt class="flex items-center justify-between font-medium text-black dark:text-white">
						{m.form_username()}:
						<Tooltip positioning={{ placement: 'top' }}>
							<Tooltip.Trigger>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Admin Username"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</Tooltip.Trigger>
							<Portal>
								<Tooltip.Positioner>
									<Tooltip.Content
										class="card w-64 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
									>
										<p>{m.setup_help_admin_username?.() || 'Admin username'}</p>
										<Tooltip.Arrow
											class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
											><Tooltip.ArrowTip /></Tooltip.Arrow
										>
									</Tooltip.Content>
								</Tooltip.Positioner>
							</Portal>
						</Tooltip>
					</dt>
					<dd class="text-tertiary-500 dark:text-primary-500">{adminUser.username}</dd>
					<dt class="flex items-center justify-between font-medium text-black dark:text-white">
						{m.form_email()}:
						<Tooltip positioning={{ placement: 'top' }}>
							<Tooltip.Trigger>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Admin Email"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</Tooltip.Trigger>
							<Portal>
								<Tooltip.Positioner>
									<Tooltip.Content
										class="card w-64 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
									>
										<p>{m.setup_help_admin_email?.() || 'Admin email'}</p>
										<Tooltip.Arrow
											class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
											><Tooltip.ArrowTip /></Tooltip.Arrow
										>
									</Tooltip.Content>
								</Tooltip.Positioner>
							</Portal>
						</Tooltip>
					</dt>
					<dd class="text-tertiary-500 dark:text-primary-500">{adminUser.email}</dd>
					<dt class="flex items-center justify-between font-medium text-black dark:text-white">
						{m.form_password()}:
						<Tooltip positioning={{ placement: 'top' }}>
							<Tooltip.Trigger>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Admin Password"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</Tooltip.Trigger>
							<Portal>
								<Tooltip.Positioner>
									<Tooltip.Content
										class="card w-64 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
									>
										<p>{m.setup_help_admin_password?.() || 'Admin password'}</p>
										<Tooltip.Arrow
											class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
											><Tooltip.ArrowTip /></Tooltip.Arrow
										>
									</Tooltip.Content>
								</Tooltip.Positioner>
							</Portal>
						</Tooltip>
					</dt>
					<dd class="text-tertiary-500 dark:text-primary-500">••••••••</dd>
				</dl>
			</div>

			<div>
				<h3 class="mb-3 flex items-center font-semibold tracking-tight text-black dark:text-white">
					<iconify-icon icon="mdi:cog" width="24" class="mr-2 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					{m.setup_review_section_system?.() || 'System Settings'}
				</h3>
				<dl class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
					<dt class="flex items-center justify-between font-medium text-black dark:text-white">
						CMS Name:
						<Tooltip positioning={{ placement: 'top' }}>
							<Tooltip.Trigger>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Site Name"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</Tooltip.Trigger>
							<Portal>
								<Tooltip.Positioner>
									<Tooltip.Content
										class="card w-64 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
									>
										<p>{m.setup_help_site_name?.() || 'The name for your CMS instance.'}</p>
										<Tooltip.Arrow
											class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
											><Tooltip.ArrowTip /></Tooltip.Arrow
										>
									</Tooltip.Content>
								</Tooltip.Positioner>
							</Portal>
						</Tooltip>
					</dt>
					<dd class="text-tertiary-500 dark:text-primary-500">{systemSettings.siteName}</dd>
					<dt class="flex items-center justify-between font-medium text-black dark:text-white">
						Production URL:
						<Tooltip positioning={{ placement: 'top' }}>
							<Tooltip.Trigger>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Production URL"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</Tooltip.Trigger>
							<Portal>
								<Tooltip.Positioner>
									<Tooltip.Content
										class="card w-80 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
									>
										<p>The production URL where your CMS will be accessible (e.g., https://mysite.com). Used for OAuth callbacks and email links.</p>
										<Tooltip.Arrow
											class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
											><Tooltip.ArrowTip /></Tooltip.Arrow
										>
									</Tooltip.Content>
								</Tooltip.Positioner>
							</Portal>
						</Tooltip>
					</dt>
					<dd class="text-tertiary-500 dark:text-primary-500">{systemSettings.hostProd}</dd>
					<dt class="flex items-center justify-between font-medium text-black dark:text-white">
						{m.setup_review_label_default_system_lang?.() || 'Default System Lang'}:
						<Tooltip positioning={{ placement: 'top' }}>
							<Tooltip.Trigger>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Default System Language"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</Tooltip.Trigger>
							<Portal>
								<Tooltip.Positioner>
									<Tooltip.Content
										class="card w-64 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
									>
										<p>{m.setup_help_default_system_language?.() || 'Primary language for the admin interface.'}</p>
										<Tooltip.Arrow
											class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
											><Tooltip.ArrowTip /></Tooltip.Arrow
										>
									</Tooltip.Content>
								</Tooltip.Positioner>
							</Portal>
						</Tooltip>
					</dt>
					<dd class="text-tertiary-500 dark:text-primary-500">{systemSettings.defaultSystemLanguage}</dd>
					<dt class="flex items-center justify-between font-medium text-black dark:text-white">
						{m.setup_review_label_system_languages?.() || 'System Languages'}:
						<Tooltip positioning={{ placement: 'top' }}>
							<Tooltip.Trigger>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for System Languages"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</Tooltip.Trigger>
							<Portal>
								<Tooltip.Positioner>
									<Tooltip.Content
										class="card w-64 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
									>
										<p>{m.setup_help_system_languages?.() || 'Available languages for the admin interface.'}</p>
										<Tooltip.Arrow
											class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
											><Tooltip.ArrowTip /></Tooltip.Arrow
										>
									</Tooltip.Content>
								</Tooltip.Positioner>
							</Portal>
						</Tooltip>
					</dt>
					<dd class="text-tertiary-500 dark:text-primary-500">{systemSettings.systemLanguages.join(', ')}</dd>
					<dt class="flex items-center justify-between font-medium text-black dark:text-white">
						{m.setup_review_label_default_content_lang?.() || 'Default Content Lang'}:
						<Tooltip positioning={{ placement: 'top' }}>
							<Tooltip.Trigger>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Default Content Language"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</Tooltip.Trigger>
							<Portal>
								<Tooltip.Positioner>
									<Tooltip.Content
										class="card w-64 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
									>
										<p>{m.setup_help_default_content_language?.() || 'Primary language for content creation.'}</p>
										<Tooltip.Arrow
											class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
											><Tooltip.ArrowTip /></Tooltip.Arrow
										>
									</Tooltip.Content>
								</Tooltip.Positioner>
							</Portal>
						</Tooltip>
					</dt>
					<dd class="text-tertiary-500 dark:text-primary-500">{systemSettings.defaultContentLanguage}</dd>
					<dt class="flex items-center justify-between font-medium text-black dark:text-white">
						{m.setup_review_label_content_languages?.() || 'Content Languages'}:
						<Tooltip positioning={{ placement: 'top' }}>
							<Tooltip.Trigger>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Content Languages"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</Tooltip.Trigger>
							<Portal>
								<Tooltip.Positioner>
									<Tooltip.Content
										class="card w-64 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
									>
										<p>{m.setup_help_content_languages?.() || 'Available languages for content translations.'}</p>
										<Tooltip.Arrow
											class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
											><Tooltip.ArrowTip /></Tooltip.Arrow
										>
									</Tooltip.Content>
								</Tooltip.Positioner>
							</Portal>
						</Tooltip>
					</dt>
					<dd class="text-tertiary-500 dark:text-primary-500">{systemSettings.contentLanguages.join(', ')}</dd>
					<dt class="flex items-center justify-between font-medium text-black dark:text-white">
						{m.setup_review_label_timezone?.() || 'Timezone'}:
						<Tooltip positioning={{ placement: 'top' }}>
							<Tooltip.Trigger>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Timezone"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</Tooltip.Trigger>
							<Portal>
								<Tooltip.Positioner>
									<Tooltip.Content
										class="card w-64 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
									>
										<p>The default timezone for the system. Used for scheduling and date displays.</p>
										<Tooltip.Arrow
											class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
											><Tooltip.ArrowTip /></Tooltip.Arrow
										>
									</Tooltip.Content>
								</Tooltip.Positioner>
							</Portal>
						</Tooltip>
					</dt>
					<dd class="text-tertiary-500 dark:text-primary-500">{systemSettings.timezone}</dd>
				</dl>
			</div>

			<div>
				<h3 class="mb-3 flex items-center font-semibold tracking-tight text-black dark:text-white">
					<iconify-icon icon="mdi:folder" width="24" class="mr-2 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					{m.setup_review_section_media?.() || 'Media Storage'}
				</h3>
				<dl class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
					<dt class="flex items-center justify-between font-medium text-black dark:text-white">
						Storage Type:
						<Tooltip positioning={{ placement: 'top' }}>
							<Tooltip.Trigger>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Storage Type"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</Tooltip.Trigger>
							<Portal>
								<Tooltip.Positioner>
									<Tooltip.Content
										class="card w-64 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
									>
										<p>{m.setup_help_media_path?.() || 'The storage mechanism for user uploads.'}</p>
										<Tooltip.Arrow
											class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
											><Tooltip.ArrowTip /></Tooltip.Arrow
										>
									</Tooltip.Content>
								</Tooltip.Positioner>
							</Portal>
						</Tooltip>
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
						<Tooltip positioning={{ placement: 'top' }}>
							<Tooltip.Trigger>
								<button
									type="button"
									tabindex="-1"
									class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
									aria-label="Help for Media Folder"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</Tooltip.Trigger>
							<Portal>
								<Tooltip.Positioner>
									<Tooltip.Content
										class="card w-80 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
									>
										<p>For local storage: specify the folder path (e.g., ./mediaFolder). For cloud storage: enter the bucket or container name.</p>
										<Tooltip.Arrow
											class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
											><Tooltip.ArrowTip /></Tooltip.Arrow
										>
									</Tooltip.Content>
								</Tooltip.Positioner>
							</Portal>
						</Tooltip>
					</dt>
					<dd class="text-tertiary-500 dark:text-primary-500">{systemSettings.mediaFolder}</dd>
				</dl>
			</div>
		</div>
	</div>
</div>
