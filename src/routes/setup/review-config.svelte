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
	// Types from setupStore
	import type { AdminUser, DbConfig, SystemSettings } from '@src/stores/setup-store.svelte.ts';
	import { PRESETS } from './presets';
	import {
		setup_step_complete,
		setup_review_section_database,
		setup_label_database_type,
		label_host,
		label_port,
		label_database,
		setup_review_section_admin,
		form_username,
		form_email,
		form_password,
		setup_review_section_system,
		setup_system_site_name,
		setup_system_host_prod,
		setup_system_timezone,
		setup_system_multi_tenant,
		setup_review_label_path
	} from '@src/paraglide/messages';

	//  props
	interface Props {
		adminUser: AdminUser;
		dbConfig: DbConfig;
		systemSettings: SystemSettings;
	}

	const { dbConfig, adminUser, systemSettings }: Props = $props();

	// Get selected preset data
	const selectedPresetData = $derived(PRESETS.find((p) => p.id === systemSettings.preset));

	function displayLang(code: string) {
		if (!code) {
			return 'N/A';
		}
		return code.toUpperCase();
	}
</script>

<div class="fade-in space-y-6">
	<div class="review-title mb-4 flex items-center gap-3 border-b border-white/10 pb-4 text-lg font-bold text-white">
		<iconify-icon icon="mdi:clipboard-check-outline" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
		{setup_step_complete() || 'Review Configuration'}
	</div>

	<!-- Selected Blueprint Banner -->
	<div
		class="selected-banner flex items-center gap-4 rounded-xl border p-4 transition-all duration-300
		{selectedPresetData ? 'border-tertiary-500/30 bg-tertiary-500/5' : 'border-white/10 bg-white/5'}"
	>
		<div
			class="banner-icon flex h-12 w-12 items-center justify-center rounded-lg
			{selectedPresetData ? 'bg-tertiary-500/15 text-tertiary-500' : 'bg-white/10 text-white/30'}"
		>
			<iconify-icon icon={selectedPresetData?.icon || 'mdi:circle-off-outline'} width="28"></iconify-icon>
		</div>
		<div class="flex-1">
			<div class="text-sm font-bold text-white sm:text-base">
				{selectedPresetData ? `Blueprint: ${selectedPresetData.title}` : 'No Blueprint Selected'}
			</div>
			<div class="text-xs text-white/40">{selectedPresetData ? selectedPresetData.description : 'Collections will be created manually'}</div>
		</div>
		{#if selectedPresetData}
			<iconify-icon icon="mdi:check-circle" width="24" class="text-tertiary-500"></iconify-icon>
		{/if}
	</div>

	<!-- Review Grid -->
	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<!-- Database -->
		<div class="review-section space-y-3">
			<h4 class="flex items-center gap-2 text-xs font-bold tracking-widest text-white/50 uppercase">
				<iconify-icon icon="mdi:database" width="16" class="text-tertiary-500"></iconify-icon>
				{setup_review_section_database() || 'Database'}
			</h4>
			<div class="dl space-y-2">
				<div class="dl-row flex items-baseline justify-between gap-4 text-sm">
					<span class="dl-label text-white/45">{setup_label_database_type() || 'Type'}</span>
					<span class="dl-value font-medium text-tertiary-500 uppercase">{dbConfig.type}</span>
				</div>
				<div class="dl-row flex items-baseline justify-between gap-4 text-sm">
					<span class="dl-label text-white/45">{label_host() || 'Host'}</span>
					<span class="dl-value font-medium text-tertiary-500">{dbConfig.host}</span>
				</div>
				{#if dbConfig.port}
					<div class="dl-row flex items-baseline justify-between gap-4 text-sm">
						<span class="dl-label text-white/45">{label_port() || 'Port'}</span>
						<span class="dl-value font-medium text-tertiary-500">{dbConfig.port}</span>
					</div>
				{/if}
				<div class="dl-row flex items-baseline justify-between gap-4 text-sm">
					<span class="dl-label text-white/45">{label_database() || 'Database'}</span>
					<span class="dl-value font-medium text-tertiary-500">{dbConfig.name}</span>
				</div>
			</div>
		</div>

		<!-- Admin -->
		<div class="review-section space-y-3">
			<h4 class="flex items-center gap-2 text-xs font-bold tracking-widest text-white/50 uppercase">
				<iconify-icon icon="mdi:account" width="16" class="text-tertiary-500"></iconify-icon>
				{setup_review_section_admin() || 'Administrator'}
			</h4>
			<div class="dl space-y-2">
				<div class="dl-row flex items-baseline justify-between gap-4 text-sm">
					<span class="dl-label text-white/45">{form_username() || 'Username'}</span>
					<span class="dl-value font-medium text-tertiary-500">{adminUser.username}</span>
				</div>
				<div class="dl-row flex items-baseline justify-between gap-4 text-sm">
					<span class="dl-label text-white/45">{form_email() || 'Email'}</span>
					<span class="dl-value font-medium text-tertiary-500">{adminUser.email}</span>
				</div>
				<div class="dl-row flex items-baseline justify-between gap-4 text-sm">
					<span class="dl-label text-white/45">{form_password() || 'Password'}</span>
					<span class="dl-value font-medium text-white/35 italic">••••••••</span>
				</div>
			</div>
		</div>

		<!-- System -->
		<div class="review-section space-y-3">
			<h4 class="flex items-center gap-2 text-xs font-bold tracking-widest text-white/50 uppercase">
				<iconify-icon icon="mdi:cog" width="16" class="text-tertiary-500"></iconify-icon>
				{setup_review_section_system() || 'System'}
			</h4>
			<div class="dl space-y-2">
				<div class="dl-row flex items-baseline justify-between gap-4 text-sm">
					<span class="dl-label text-white/45">{setup_system_site_name() || 'CMS Name'}</span>
					<span class="dl-value font-medium text-tertiary-500">{systemSettings.siteName}</span>
				</div>
				<div class="dl-row flex items-baseline justify-between gap-4 text-sm">
					<span class="dl-label text-white/45">{setup_system_host_prod() || 'Production URL'}</span>
					<span class="dl-value font-medium text-tertiary-500">{systemSettings.hostProd}</span>
				</div>
				<div class="dl-row flex items-baseline justify-between gap-4 text-sm">
					<span class="dl-label text-white/45">{setup_system_timezone() || 'Timezone'}</span>
					<span class="dl-value font-medium text-tertiary-500">{systemSettings.timezone}</span>
				</div>
				<div class="dl-row flex items-baseline justify-between gap-4 text-sm">
					<span class="dl-label text-white/45">{setup_system_multi_tenant() || 'Multi-Tenant'}</span>
					{#if systemSettings.multiTenant}
						<span class="status-pill rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30"
							>ENABLED</span
						>
					{:else}
						<span class="status-pill rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/30 border border-white/10">DISABLED</span>
					{/if}
				</div>
				<div class="dl-row flex items-baseline justify-between gap-4 text-sm">
					<span class="dl-label text-white/45">Redis Cache</span>
					{#if systemSettings.useRedis}
						<span class="status-pill rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30"
							>ENABLED</span
						>
					{:else}
						<span class="status-pill rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/30 border border-white/10">DISABLED</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- Languages & Media -->
		<div class="review-section space-y-3">
			<h4 class="flex items-center gap-2 text-xs font-bold tracking-widest text-white/50 uppercase">
				<iconify-icon icon="mdi:translate" width="16" class="text-tertiary-500"></iconify-icon>
				Languages & Media
			</h4>
			<div class="dl space-y-2">
				<div class="dl-row flex items-baseline justify-between gap-4 text-sm">
					<span class="dl-label text-white/45">System Lang</span>
					<span class="dl-value font-medium text-tertiary-500 uppercase">{displayLang(systemSettings.defaultSystemLanguage)}</span>
				</div>
				<div class="dl-row flex items-baseline justify-between gap-4 text-sm">
					<span class="dl-label text-white/45">Content Lang</span>
					<span class="dl-value font-medium text-tertiary-500 uppercase">{displayLang(systemSettings.defaultContentLanguage)}</span>
				</div>
				<div class="dl-row flex items-baseline justify-between gap-4 text-sm">
					<span class="dl-label text-white/45">Storage</span>
					<span class="dl-value font-medium text-tertiary-500">{systemSettings.mediaStorageType === 'local' ? '📁 Local' : '☁️ Cloud'}</span>
				</div>
				<div class="dl-row flex items-baseline justify-between gap-4 text-sm">
					<span class="dl-label text-white/45">{setup_review_label_path() || 'Media Folder'}</span>
					<span class="dl-value font-medium text-tertiary-500">{systemSettings.mediaFolder}</span>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.review-title iconify-icon {
		color: var(--color-tertiary-500, #6ee7b7);
	}
	.banner-icon {
		color: var(--color-tertiary-500, #6ee7b7);
		background: rgba(110, 231, 183, 0.1);
	}
	.selected-banner {
		background: rgba(110, 231, 183, 0.03);
	}
	.dl-value {
		text-align: right;
	}
</style>
