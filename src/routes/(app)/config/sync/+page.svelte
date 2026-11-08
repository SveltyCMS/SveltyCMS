<!--
@file src/routes/(app)/config/sync/+page.svelte
@component
**Configuration Sync & Backup Manager**
Allows synchronization between filesystem and database, safety mode selection, and configuration export.

### Features:
- Real-time drift detection (New, Updated, Deleted)
- 4 Safety Modes: Merge, Add, Mirror, Replace
- One-click configuration export to filesystem
- Unmet requirement detection and safety gating
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { fetchApi, type ApiResponse } from '@utils/http-client';
	import { logger } from '@utils/logger';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { fade, slide } from 'svelte/transition';
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import Loader from '@components/ui/loader.svelte';
	import Tabs from '@components/ui/tabs.svelte';
	import HelpIcon from '@components/ui/help-icon.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import {
		SMART_TABLE,
		SMART_TABLE_ROW_HOVER,
		SMART_TABLE_TD,
		SMART_TABLE_TH,
		SMART_TABLE_THEAD
	} from '@components/ui/smart-table/chrome';
	import {
		sync_action,
		sync_backup_heading,
		sync_backup_intro,
		sync_changes_detected,
		sync_changes_summary,
		sync_deleted_missing,
		sync_export_schema,
		sync_in_sync,
		sync_in_sync_desc,
		sync_name,
		sync_new_create,
		sync_options_aria,
		sync_raw_api,
		sync_safety_mode,
		sync_safety_mode_aria,
		sync_sync_path,
		sync_title,
		sync_type,
		sync_unmet_heading,
		sync_unmet_intro,
		sync_updated_merge
	} from '@src/paraglide/messages';

	type ConfigStatus = {
		status: 'in_sync' | 'changes_detected' | 'error';
		changes: {
			new?: { name: string; uuid: string; type: string }[];
			updated?: { name: string; uuid: string; type: string }[];
			deleted?: { name: string; uuid: string; type: string }[];
		};
		unmetRequirements: { name: string; type: string; requirement: string }[];
	} | null;

	type SafetyMode = 'merge' | 'add' | 'mirror' | 'replace';

	type SyncTab = 'sync' | 'backups' | 'debug';

	let { data } = $props();

	let status: ConfigStatus = $state(
		untrack(() => (data.status as unknown as ConfigStatus) ?? null)
	);
	let isLoading = $state(false);
	let isProcessing = $state(false);
	let isExporting = $state(false);
	let activeTab: SyncTab = $state('sync');
	let selectedMode: SafetyMode = $state('merge');

	/** Same shared `Tabs` component as /user, extensions and access management. */
	const syncTabs = [
		{ id: 'sync', label: 'Sync', shortLabel: 'Sync', icon: 'mdi:sync' },
		{
			id: 'backups',
			label: 'Data & Backups',
			shortLabel: 'Data',
			icon: 'mdi:database-export-outline'
		},
		{ id: 'debug', label: 'Debug', shortLabel: 'Debug', icon: 'mdi:bug-outline' }
	];

	const modeDescriptions: Record<
		SafetyMode,
		{ label: string; description: string; badge: string }
	> = {
		merge: {
			label: 'Merge (Recommended)',
			description:
				'Creates new entities and updates modified ones. Never deletes database records.',
			badge: 'Safe'
		},
		add: {
			label: 'Add Only',
			description: 'Only creates missing entities. Never updates or deletes existing records.',
			badge: 'Safest'
		},
		mirror: {
			label: 'Mirror',
			description: 'Matches filesystem exactly. Creates, updates, and deletes database records.',
			badge: 'Destructive'
		},
		replace: {
			label: 'Replace',
			description: 'Drops all existing configuration and re-imports from filesystem.',
			badge: 'High Risk'
		}
	};

	const changeSummary = $derived(() => ({
		new: status?.changes?.new?.length || 0,
		updated: status?.changes?.updated?.length || 0,
		deleted: status?.changes?.deleted?.length || 0
	}));

	async function loadStatus() {
		isLoading = true;
		try {
			const result = await fetchApi<ConfigStatus>('/api/config/status');
			if (!result.success) {
				throw new Error(result.message || 'Failed to fetch status');
			}
			const payload =
				(result as { data?: ConfigStatus }).data ?? (result as unknown as ConfigStatus);
			status =
				payload && typeof payload === 'object' && 'status' in payload ? payload : (result as any);
			logger.debug('[Config Sync] Received status:', $state.snapshot(status));
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			toast.error(`Failed to fetch status: ${errorMsg}`);
			status = null;
		} finally {
			isLoading = false;
		}
	}

	async function performSync() {
		if (!status || (status?.unmetRequirements?.length ?? 0) > 0) {
			toast.warning('Sync blocked due to unmet requirements.');
			return;
		}

		if (selectedMode === 'mirror' || selectedMode === 'replace') {
			const confirmed = window.confirm(
				`Warning: "${selectedMode.toUpperCase()}" mode may delete existing configuration records in the database. Are you sure you want to proceed?`
			);
			if (!confirmed) return;
		}

		isProcessing = true;
		try {
			toast.info(`Creating configuration plan (${selectedMode} mode)...`);
			const planResult: ApiResponse<{ planId?: string; mode?: string }> = await fetchApi(
				'/api/config/plan',
				{
					method: 'POST',
					body: JSON.stringify({ mode: selectedMode })
				}
			);
			if (!planResult.success) {
				throw new Error(planResult.message || 'Plan failed');
			}
			const plan =
				(planResult as { data?: { planId?: string; mode?: string } }).data ??
				(planResult as { planId?: string; mode?: string });
			if (!plan?.planId) {
				throw new Error('Plan response did not include a planId.');
			}

			const applyResult: ApiResponse<{ message?: string }> = await fetchApi('/api/config/apply', {
				method: 'POST',
				body: JSON.stringify({ planId: plan.planId, mode: plan.mode || selectedMode })
			});
			if (!applyResult.success) {
				throw new Error(applyResult.message || 'Apply failed');
			}
			const result =
				(applyResult as { data?: { message?: string } }).data ??
				(applyResult as { message?: string });
			toast.success(result.message || 'Configuration synchronized successfully!');
			await loadStatus();
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			toast.error(`Sync failed: ${errorMsg}`);
		} finally {
			isProcessing = false;
		}
	}

	async function exportCurrentConfig() {
		isExporting = true;
		try {
			toast.info('Exporting database configuration to filesystem...');
			const result: ApiResponse<{ dirPath: string }> = await fetchApi('/api/config/export', {
				method: 'POST',
				body: JSON.stringify({})
			});
			if (!result.success) {
				throw new Error(result.message || 'Export failed');
			}
			const data =
				(result as { data?: { dirPath?: string } }).data ?? (result as { dirPath?: string });
			toast.success(`Export complete! Saved to ${data?.dirPath || 'config/sync/'}`);
			await loadStatus();
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			toast.error(`Export failed: ${errorMsg}`);
		} finally {
			isExporting = false;
		}
	}
</script>

<AdminPageShell
	title={sync_title()}
	icon="mdi:sync"
	description="Synchronize configuration between filesystem and database (Schema as Code)"
	showBackButton={true}
	backUrl="/config"
>
	<div data-testid="sync-page" class="flex w-full min-w-0 flex-col gap-2">
		<!-- A new user needs the model before the controls: configuration lives in
		     two places and this page reconciles them. -->
		<AdminCard
			class="border border-(--admin-border-default) bg-(--admin-bg-card) p-3 shadow-xs"
			data-testid="sync-explainer"
		>
			<div class="flex items-start gap-2">
				<iconify-icon
					icon="mdi:information-outline"
					width="20"
					class="mt-0.5 shrink-0 text-tertiary-500 dark:text-primary-500"
				></iconify-icon>
				<div class="min-w-0 space-y-1">
					<h2 class="text-sm font-semibold text-(--admin-text-body)">What Config Sync does</h2>
					<p class="text-sm text-(--admin-text-muted)">
						Configuration — collections, roles, permissions, settings, widgets, themes, webhooks and
						automations — exists twice: in the database and as JSON under
						<code class="rounded bg-surface-500/10 px-1 py-0.5">{sync_sync_path()}</code>. This page
						keeps the two sides in step, like Drupal's <code>drush cex</code> /
						<code>drush cim</code>.
					</p>
				</div>
			</div>

			<div class="mt-3 grid gap-2 md:grid-cols-3">
				<div class="rounded-md border border-surface-500/20 bg-surface-500/10 p-3">
					<div class="flex items-center gap-1.5 text-sm font-semibold">
						<iconify-icon
							icon="mdi:export"
							width="16"
							class="text-tertiary-500 dark:text-primary-500"
						></iconify-icon>
						1. Export <code class="text-xs">drush cex</code>
					</div>
					<p class="mt-1 text-xs text-(--admin-text-muted)">
						Writes the active database configuration into that folder. Commit it — the JSON becomes
						the reviewable source of truth.
					</p>
				</div>
				<div class="rounded-md border border-surface-500/20 bg-surface-500/10 p-3">
					<div class="flex items-center gap-1.5 text-sm font-semibold">
						<iconify-icon
							icon="mdi:source-branch"
							width="16"
							class="text-tertiary-500 dark:text-primary-500"
						></iconify-icon>
						2. Review the diff
					</div>
					<p class="mt-1 text-xs text-(--admin-text-muted)">
						The table below lists what differs as New, Updated or Deleted. Nothing has been written
						to the database at this point.
					</p>
				</div>
				<div class="rounded-md border border-surface-500/20 bg-surface-500/10 p-3">
					<div class="flex items-center gap-1.5 text-sm font-semibold">
						<iconify-icon icon="mdi:sync" width="16" class="text-tertiary-500 dark:text-primary-500"
						></iconify-icon>
						3. Apply <code class="text-xs">drush cim</code>
					</div>
					<p class="mt-1 text-xs text-(--admin-text-muted)">
						Imports the folder into the database using the selected safety mode. Unmet requirements
						block the import.
					</p>
				</div>
			</div>

			<p class="mt-2 text-xs text-(--admin-text-muted)">
				<strong>Content is separate.</strong> Entries, media and pages are not exported here — use
				<a href="/config?plugin=smart-importer" class="underline">Smart Importer</a> or content
				packages, and let the database engine own full backups (<code>pg_dump</code>,
				<code>mariadb-dump</code>,
				<code>sqlite3 .backup</code>).
			</p>
		</AdminCard>

		<AdminCard class="border border-(--admin-border-default) bg-(--admin-bg-card) p-2 shadow-xs">
			<Tabs
				tabs={syncTabs}
				bind:activeTab
				variant="underline"
				ariaLabel={sync_options_aria()}
				testId="sync-tabs"
				onTabChange={(id) => (activeTab = id as SyncTab)}
			/>

			<section id="tabpanel-{activeTab}" role="tabpanel" class="pt-2" transition:fade|local>
				{#if activeTab === 'sync'}
					{#if status?.unmetRequirements && status.unmetRequirements.length > 0}
						<div
							class="alert bg-error-500/10 text-error-500 border border-error-500/30 dark:bg-error-500/20 dark:text-error-400 dark:border-error-500/40 my-4 p-4 rounded-md"
							transition:slide
						>
							<h4 class="font-bold flex items-center gap-2">
								<iconify-icon icon="mdi:alert-circle"></iconify-icon>
								{sync_unmet_heading()}
							</h4>
							<p class="text-sm mt-1">
								{sync_unmet_intro()}
							</p>
							<ul class="mt-2 list-disc ps-5 text-sm">
								{#each status.unmetRequirements as req (req.name + req.type)}
									<li><strong>{req.name}</strong> ({req.type}): {req.requirement}</li>
								{/each}
							</ul>
						</div>
					{/if}

					<!-- Action Controls -->
					<div
						class="mt-2 rounded-lg border border-(--admin-border-default) bg-surface-500/10 p-3 flex flex-col md:flex-row gap-3 items-start md:items-center justify-between"
					>
						<!-- Safety Mode Selector -->
						<div class="flex flex-col gap-1.5 w-full md:w-auto">
							<div class="flex items-center gap-1.5">
								<label
									for="safety-mode-select"
									class="text-xs font-semibold uppercase tracking-wider text-surface-500"
								>
									{sync_safety_mode()}
								</label>
								<SystemTooltip
									title="How the import treats records that already exist. Merge keeps everything and updates matches; Add only creates; Mirror makes the database match the folder (deletes extras); Replace drops and re-imports everything."
								>
									<HelpIcon ariaLabel="Help for promotion safety mode" tabindex={0} />
								</SystemTooltip>
							</div>
							<div class="flex items-center gap-2">
								<select
									id="safety-mode-select"
									aria-label={sync_safety_mode_aria()}
									bind:value={selectedMode}
									class="px-3 py-1.5 text-sm rounded-md border border-(--admin-border-default) bg-(--admin-bg-card) text-(--admin-text-body) focus:ring-2 focus:ring-primary-500 focus:outline-hidden"
								>
									{#each ['merge', 'add', 'mirror', 'replace'] as const as mode (mode)}
										<option value={mode}>{modeDescriptions[mode].label}</option>
									{/each}
								</select>
								<Badge
									variant={selectedMode === 'merge'
										? 'tertiary'
										: selectedMode === 'add'
											? 'surface'
											: selectedMode === 'mirror'
												? 'warning'
												: 'error'}
									class="text-xs"
								>
									{modeDescriptions[selectedMode].badge}
								</Badge>
							</div>
							<p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
								{modeDescriptions[selectedMode].description}
							</p>
						</div>

						<!-- Action Buttons -->
						<div class="flex flex-wrap gap-2 w-full md:w-auto justify-end">
							<SystemTooltip
								title="Writes the active database configuration to config/sync/ (drush cex). Commit the folder so the change is reviewable."
							>
								<Button
									variant="ghost"
									disabled={isExporting || isLoading}
									onclick={exportCurrentConfig}
									data-testid="config-export-btn"
									leadingIcon="mdi:export"
								>
									{isExporting ? 'Exporting...' : 'Export to Filesystem'}
								</Button>
							</SystemTooltip>

							<SystemTooltip
								title="Re-reads the filesystem and the database and recomputes the diff. Writes nothing."
							>
								<Button
									variant="ghost"
									disabled={isLoading || isProcessing}
									onclick={loadStatus}
									data-testid="sync-refresh"
									leadingIcon="mdi:refresh"
								>
									{isLoading ? 'Checking...' : 'Refresh'}
								</Button>
							</SystemTooltip>

							<Button
								variant="tertiary"
								disabled={isProcessing ||
									!status ||
									status.status === 'in_sync' ||
									(status?.unmetRequirements?.length ?? 0) > 0}
								onclick={performSync}
								data-testid="sync-run"
								leadingIcon="mdi:sync"
							>
								{isProcessing ? 'Syncing...' : 'Apply Changes'}
							</Button>
						</div>
						<p class="mt-1 w-full text-end text-xs text-(--admin-text-muted)">
							Apply is disabled while there is nothing to import or a requirement is unmet.
						</p>
					</div>

					{#if isLoading}
						<div
							class="flex flex-col items-center py-12 text-surface-500"
							data-testid="sync-loading"
						>
							<Loader
								variant="text"
								lines={2}
								lastLineWidth="50%"
								ariaLabel="Checking synchronization status"
							/>
						</div>
					{:else if status?.status === 'in_sync'}
						<div class="space-y-3 py-12 text-center" data-testid="sync-in-sync">
							<iconify-icon icon="mdi:check-circle" class="mx-auto text-6xl text-success-500"
							></iconify-icon>
							<h2 class="text-xl font-semibold">{sync_in_sync()}</h2>
							<p class="text-surface-500">
								{sync_in_sync_desc()}
							</p>
						</div>
					{:else}
						<div class="space-y-4" data-testid="sync-changes">
							<div class="flex items-center justify-between">
								<h3 class="flex items-center gap-2 text-lg font-semibold">
									<iconify-icon icon="mdi:alert" class="text-warning-500"></iconify-icon>
									{sync_changes_detected()}
								</h3>
								<p class="text-sm text-surface-500">
									{sync_changes_summary({
										newCount: changeSummary().new,
										updatedCount: changeSummary().updated,
										deletedCount: changeSummary().deleted
									})}
								</p>
							</div>

							<p class="text-xs text-(--admin-text-muted)">
								<strong>New</strong> exists on disk but not in the database ·
								<strong>Updated</strong> differs between the two ·
								<strong>Deleted</strong> exists in the database but not on disk.
							</p>

							<AdminCard
								class="my-2 w-full overflow-x-auto border border-(--admin-border-default) sm:my-3"
							>
								<table class={SMART_TABLE}>
									<thead class={SMART_TABLE_THEAD}>
										<tr
											class="border-b border-surface-500/30 text-xs uppercase tracking-wide dark:border-surface-600"
										>
											<th class="{SMART_TABLE_TH} text-start!">{sync_name()}</th>
											<th class="{SMART_TABLE_TH} text-start!">{sync_type()}</th>
											<th class="{SMART_TABLE_TH} text-start!">UUID</th>
											<th class="{SMART_TABLE_TH} text-end!">{sync_action()}</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-surface-200/30 dark:divide-surface-700/30">
										{#each Object.entries(status?.changes || {}) as [changeType, items] (changeType)}
											{#each items as item (item.uuid || item.name)}
												<tr class={SMART_TABLE_ROW_HOVER}>
													<td class="{SMART_TABLE_TD} text-start! font-medium">{item.name}</td>
													<td class="{SMART_TABLE_TD} text-start!">
														<Badge preset="tonal" color="surface" class="capitalize"
															>{item.type}</Badge
														>
													</td>
													<td
														class="{SMART_TABLE_TD} text-start! font-mono text-xs text-(--admin-text-muted)"
														>{item.uuid || '-'}</td
													>
													<td class="{SMART_TABLE_TD} text-end!">
														{#if changeType === 'new'}
															<Badge variant="tertiary" class="dark:bg-primary-500 dark:text-white"
																>{sync_new_create()}</Badge
															>
														{/if}
														{#if changeType === 'updated'}
															<Badge variant="warning">{sync_updated_merge()}</Badge>
														{/if}
														{#if changeType === 'deleted'}
															<Badge variant="error">{sync_deleted_missing()}</Badge>
														{/if}
													</td>
												</tr>
											{/each}
										{/each}
									</tbody>
								</table>
							</AdminCard>
						</div>
					{/if}
				{/if}

				{#if activeTab === 'backups'}
					<div transition:slide|local class="space-y-2">
						<div class="rounded-lg border border-(--admin-border-default) bg-surface-500/10 p-3">
							<h3 class="flex items-center gap-2 text-sm font-semibold">
								<iconify-icon icon="mdi:database-export-outline"></iconify-icon>
								{sync_backup_heading()}
							</h3>
							<p class="mt-1 text-sm text-(--admin-text-muted)">{sync_backup_intro()}</p>
							<p class="mt-2 text-xs text-(--admin-text-muted)">
								The button below writes <strong>schema files</strong> — the same export as the Sync tab.
								It is not a database dump and not a content archive.
							</p>
						</div>

						<div class="grid gap-2 md:grid-cols-3">
							<div class="rounded-lg border border-(--admin-border-default) p-3">
								<h4 class="text-sm font-semibold">Configuration</h4>
								<p class="mt-1 text-xs text-(--admin-text-muted)">
									Collections, roles, permissions, settings, widgets, themes, webhooks and
									automations, serialized to <code>{sync_sync_path()}</code> for Git.
								</p>
								<Button
									variant="tertiary"
									size="sm"
									class="mt-2"
									onclick={exportCurrentConfig}
									loading={isExporting}
									leadingIcon="mdi:file-export"
								>
									{sync_export_schema()}
								</Button>
							</div>

							<div class="rounded-lg border border-(--admin-border-default) p-3">
								<h4 class="text-sm font-semibold">Content</h4>
								<p class="mt-1 text-xs text-(--admin-text-muted)">
									Entries, media and pages travel as content packages (NDJSON), not as schema.
									Import them with Smart Importer.
								</p>
								<a
									href="/config?plugin=smart-importer"
									class="mt-2 inline-flex text-xs font-medium text-tertiary-500 underline dark:text-primary-500"
								>
									Open Smart Importer
								</a>
							</div>

							<div class="rounded-lg border border-(--admin-border-default) p-3">
								<h4 class="text-sm font-semibold">Full database backup</h4>
								<p class="mt-1 text-xs text-(--admin-text-muted)">
									Snapshots belong to the database engine: <code>pg_dump</code>,
									<code>mariadb-dump</code>, or <code>sqlite3 .backup</code>. The CMS does not run
									them for you.
								</p>
							</div>
						</div>
					</div>
				{/if}

				{#if activeTab === 'debug'}
					<div
						transition:slide|local
						class="rounded border border-surface-500/30 bg-surface-500/10 p-3 dark:border-surface-500/40 dark:bg-surface-900/20"
					>
						<h3 class="mb-1 flex items-center gap-2 font-semibold">
							<iconify-icon icon="mdi:bug-outline"></iconify-icon>
							{sync_raw_api()}
						</h3>
						<p class="mb-3 text-xs text-(--admin-text-muted)">
							Read-only JSON from the last status call. Attach it to a support ticket; it contains
							no secrets or entry content.
						</p>
						<pre
							class="whitespace-pre-wrap text-xs max-h-125 overflow-y-auto p-2 border border-(--admin-border-default) rounded bg-surface-500/10 dark:bg-surface-800">{JSON.stringify(
								status,
								null,
								2
							)}</pre>
					</div>
				{/if}
			</section>
		</AdminCard>
	</div>
</AdminPageShell>
