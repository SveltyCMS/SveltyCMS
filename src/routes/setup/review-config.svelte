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
	import { setup_step_complete } from '@src/paraglide/messages';

	//  props
	interface Props {
		adminUser: AdminUser;
		dbConfig: DbConfig;
		systemSettings: SystemSettings;
	}

	const { dbConfig, adminUser, systemSettings }: Props = $props();

	// Get selected preset data
	const selectedPresetData = $derived(PRESETS.find((p) => p.id === systemSettings.preset));
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
			<div class="mb-2 text-xs text-white/40">{selectedPresetData ? selectedPresetData.description : 'Collections will be created manually'}</div>

			{#if selectedPresetData?.features}
				<div class="flex flex-wrap gap-1.5">
					{#each selectedPresetData.features as feature}
						<span
							class="inline-flex items-center rounded-full bg-tertiary-500/10 px-2 py-0.5 text-[10px] font-medium text-tertiary-500 ring-1 ring-inset ring-tertiary-500/20"
						>
							{feature}
						</span>
					{/each}
				</div>
			{/if}
		</div>
		{#if selectedPresetData}
			<iconify-icon icon="mdi:check-circle" width="24" class="text-tertiary-500"></iconify-icon>
		{/if}
	</div>

	<!-- Review Grid -->
	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<!-- Database Section -->
		<div class="overflow-hidden rounded-xl border border-white/5 bg-white/5 transition-all hover:bg-white/[0.07]">
			<div class="flex items-center gap-2 bg-blue-500/10 px-4 py-2.5 text-blue-400">
				<iconify-icon icon="mdi:database" width="18"></iconify-icon>
				<span class="text-sm font-bold uppercase tracking-wider">Database Configuration</span>
			</div>
			<div class="p-4">
				<div class="grid grid-cols-2 gap-y-3 text-sm">
					<span class="text-white/40">Type</span>
					<span class="text-white uppercase">{dbConfig.type}</span>

					<span class="text-white/40">Host</span>
					<span class="text-white">{dbConfig.host}{dbConfig.port ? `:${dbConfig.port}` : ''}</span>

					<span class="text-white/40">Name</span>
					<span class="text-white font-mono">{dbConfig.name}</span>

					<span class="text-white/40">User</span>
					<span class="text-white">{dbConfig.user || '(none)'}</span>
				</div>
			</div>
		</div>

		<!-- Admin Section -->
		<div class="overflow-hidden rounded-xl border border-white/5 bg-white/5 transition-all hover:bg-white/[0.07]">
			<div class="flex items-center gap-2 bg-emerald-500/10 px-4 py-2.5 text-emerald-400">
				<iconify-icon icon="mdi:account-circle" width="18"></iconify-icon>
				<span class="text-sm font-bold uppercase tracking-wider">Administrator Account</span>
			</div>
			<div class="p-4">
				<div class="grid grid-cols-2 gap-y-3 text-sm">
					<span class="text-white/40">Username</span>
					<span class="text-white font-medium">{adminUser.username}</span>

					<span class="text-white/40">Email</span>
					<span class="text-white">{adminUser.email}</span>

					<span class="text-white/40">Password</span>
					<div class="flex items-center gap-1.5">
						<span class="text-white/30 italic">••••••••</span>
						<iconify-icon icon="mdi:shield-check" class="text-emerald-500" width="14"></iconify-icon>
					</div>
				</div>
			</div>
		</div>

		<!-- System Section -->
		<div class="overflow-hidden rounded-xl border border-white/5 bg-white/5 transition-all hover:bg-white/[0.07] md:col-span-2">
			<div class="flex items-center gap-2 bg-purple-500/10 px-4 py-2.5 text-purple-400">
				<iconify-icon icon="mdi:cog" width="18"></iconify-icon>
				<span class="text-sm font-bold uppercase tracking-wider">System Settings</span>
			</div>
			<div class="p-4">
				<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
					<div class="space-y-1">
						<div class="text-xs text-white/40">Site Name</div>
						<div class="text-sm font-medium text-white">{systemSettings.siteName}</div>
					</div>
					<div class="space-y-1">
						<div class="text-xs text-white/40">Production URL</div>
						<div class="text-sm font-medium text-white">{systemSettings.hostProd}</div>
					</div>
					<div class="space-y-1">
						<div class="text-xs text-white/40">Timezone</div>
						<div class="text-sm font-medium text-white font-mono">{systemSettings.timezone}</div>
					</div>
					<div class="space-y-1">
						<div class="text-xs text-white/40">Media Storage</div>
						<div class="flex items-center gap-1.5 text-sm font-medium text-white">
							<iconify-icon icon={systemSettings.mediaStorageType === 'local' ? 'mdi:folder' : 'mdi:cloud'} width="14"></iconify-icon>
							{systemSettings.mediaStorageType}
						</div>
					</div>
					<div class="space-y-1">
						<div class="text-xs text-white/40">Languages</div>
						<div class="flex flex-wrap gap-1 text-sm font-medium text-white uppercase">
							{systemSettings.systemLanguages.join(', ')}
						</div>
					</div>
					<div class="space-y-1">
						<div class="text-xs text-white/40">Redis Caching</div>
						<div class="flex items-center gap-1.5 text-sm font-medium text-white">
							<iconify-icon
								icon={systemSettings.useRedis ? 'mdi:check-circle' : 'mdi:close-circle'}
								class={systemSettings.useRedis ? 'text-emerald-500' : 'text-white/20'}
								width="14"
							></iconify-icon>
							{systemSettings.useRedis ? 'Enabled' : 'Disabled'}
						</div>
					</div>
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
</style>
