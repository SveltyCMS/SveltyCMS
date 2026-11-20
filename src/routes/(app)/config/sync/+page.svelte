<!--
@file src/routes/(app)/config/sync/+page.svelte
@component
**Configuration Sync & Backup Manager**
Allows synchronization between compiled filesystem schemas and the database, promotion safety mode selection, and snapshot export/history.

### Features:
- Collapsible explainer bar (saves workspace height by default)
- Real-time drift detection (New, Updated, Deleted)
- 4 enforced Safety Modes: Merge, Add Only, Mirror, Replace (with Modal confirmation)
- One-click configuration snapshot export to config/sync/ + snapshot inventory table
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
	import Modal from '@components/ui/modal.svelte';
	import Tabs from '@components/ui/tabs.svelte';
	import HelpIcon from '@components/ui/help-icon.svelte';
	import StickyActions from '@components/ui/sticky-actions.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import {
		SMART_TABLE,
		SMART_TABLE_ROW_HOVER,
		SMART_TABLE_TD,
		SMART_TABLE_TH,
		SMART_TABLE_THEAD
	} from '@components/ui/smart-table/chrome';
	import { formatDateTime } from '@utils/format-date';
	import {
		button_cancel,
		sync_action,
		sync_apply_btn,
		sync_apply_hint_disabled,
		sync_applying_btn,
		sync_backup_heading,
		sync_backup_intro,
		sync_changes_detected,
		sync_changes_summary,
		sync_checking_btn,
		sync_col_adapter,
		sync_col_created,
		sync_col_resources,
		sync_col_snapshot,
		sync_confirm_body,
		sync_confirm_title,
		sync_deleted_missing,
		sync_explainer_intro,
		sync_explainer_title,
		sync_export_btn,
		sync_export_btn_tip,
		sync_export_schema,
		sync_exporting_btn,
		sync_in_sync,
		sync_in_sync_desc,
		sync_name,
		sync_new_create,
		sync_options_aria,
		sync_raw_api,
		sync_refresh_btn,
		sync_refresh_btn_tip,
		sync_safety_mode,
		sync_safety_mode_aria,
		sync_safety_mode_tip,
		sync_snapshots_empty,
		sync_snapshots_heading,
		sync_step_apply_desc,
		sync_step_apply_title,
		sync_step_diff_desc,
		sync_step_diff_title,
		sync_step_export_desc,
		sync_step_export_title,
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
		unmetRequirements: { key?: string; name?: string; type?: string; requirement?: string }[];
	} | null;

	type ExportSnapshot = {
		dirName: string;
		dirPath: string;
		createdAt: string;
		adapter: string;
		tenantId: string;
		resources: Record<string, number>;
		totalResources: number;
	};

	type SafetyMode = 'merge' | 'add' | 'mirror' | 'replace';

	type SyncTab = 'sync' | 'backups' | 'debug';

	let { data } = $props();

	let status: ConfigStatus = $state(
		untrack(() => (data.status as unknown as ConfigStatus) ?? null)
	);
	let snapshots: ExportSnapshot[] = $state(
		untrack(() => (data.exports as unknown as ExportSnapshot[]) ?? [])
	);
	let isLoading = $state(false);
	let isProcessing = $state(false);
	let isExporting = $state(false);
	let showExplainer = $state(false);
	let confirmModalOpen = $state(false);
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
			description: 'Matches filesystem schemas. Creates, updates, and deletes database records.',
			badge: 'Destructive'
		},
		replace: {
			label: 'Replace',
			description: 'Drops mismatched configuration and re-imports from schemas.',
			badge: 'High Risk'
		}
	};

	const changeSummary = $derived(() => ({
		new: status?.changes?.new?.length || 0,
		updated: status?.changes?.updated?.length || 0,
		deleted: status?.changes?.deleted?.length || 0
	}));

	const applyBlocked = $derived(
		isProcessing ||
			!status ||
			status.status === 'in_sync' ||
			(status?.unmetRequirements?.length ?? 0) > 0
	);

	async function loadSnapshots() {
		try {
			const result = await fetchApi<{ exports?: ExportSnapshot[] }>('/api/config/exports');
			if (result.success) {
				const list = result.data?.exports;
				if (Array.isArray(list)) snapshots = list;
			}
		} catch (err) {
			logger.debug('[Config Sync] Failed to refresh snapshots list', err);
		}
	}

	async function loadStatus() {
		isLoading = true;
		try {
			const [statusRes] = await Promise.all([
				fetchApi<ConfigStatus>('/api/config/status'),
				loadSnapshots()
			]);
			if (!statusRes.success) {
				throw new Error(statusRes.message || 'Failed to fetch status');
			}
			const payload =
				(statusRes as { data?: ConfigStatus }).data ?? (statusRes as unknown as ConfigStatus);
			status =
				payload && typeof payload === 'object' && 'status' in payload
					? payload
					: (statusRes as any);
			logger.debug('[Config Sync] Received status:', $state.snapshot(status));
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			toast.error(`Failed to fetch status: ${errorMsg}`);
			status = null;
		} finally {
			isLoading = false;
		}
	}

	function handleApplyClick() {
		if (!status || (status?.unmetRequirements?.length ?? 0) > 0) {
			toast.warning('Sync blocked due to unmet requirements.');
			return;
		}

		if (selectedMode === 'mirror' || selectedMode === 'replace') {
			confirmModalOpen = true;
			return;
		}

		void executeSync(false);
	}

	async function executeSync(confirmed: boolean) {
		confirmModalOpen = false;
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
				body: JSON.stringify({
					planId: plan.planId,
					mode: plan.mode || selectedMode,
					confirmed
				})
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
			toast.info('Exporting database configuration snapshot...');
			const result: ApiResponse<{ dirPath: string }> = await fetchApi('/api/config/export', {
				method: 'POST',
				body: JSON.stringify({})
			});
			if (!result.success) {
				throw new Error(result.message || 'Export failed');
			}
			const exportData =
				(result as { data?: { dirPath?: string } }).data ?? (result as { dirPath?: string });
			toast.success(`Export complete! Saved to ${exportData?.dirPath || 'config/sync/'}`);
			await Promise.all([loadStatus(), loadSnapshots()]);
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
	showBackButton={true}
	backUrl="/config"
	fullHeight={true}
	flushContent={true}
	titleCompact={true}
>
	<div data-testid="sync-page" class="flex min-h-0 flex-1 flex-col gap-2 -mt-1 sm:mt-0">
		<div class="shrink-0 space-y-2">
			<!-- Collapsible explainer: saves vertical viewport space until requested -->
			<AdminCard
				class="border border-(--admin-border-default) bg-(--admin-bg-card) p-3 shadow-xs"
				data-testid="sync-explainer"
			>
				<button
					type="button"
					onclick={() => (showExplainer = !showExplainer)}
					aria-expanded={showExplainer}
					data-testid="sync-explainer-toggle"
					class="flex w-full items-center justify-between gap-2 text-start"
				>
					<span class="flex items-center gap-2 text-sm font-semibold text-(--admin-text-body)">
						<iconify-icon
							icon="mdi:information-outline"
							width="18"
							class="shrink-0 text-tertiary-500 dark:text-primary-500"
							aria-hidden="true"
						></iconify-icon>
						<span>{sync_explainer_title()}</span>
					</span>
					<iconify-icon
						icon="mdi:chevron-down"
						width="20"
						class="shrink-0 text-(--admin-text-muted) transition-transform duration-200 {showExplainer
							? 'rotate-180'
							: ''}"
						aria-hidden="true"
					></iconify-icon>
				</button>

				{#if showExplainer}
					<div class="mt-3 space-y-3 border-t border-surface-500/20 pt-3" transition:slide|local>
						<p class="text-sm text-(--admin-text-muted)">
							{sync_explainer_intro()}
							<code class="rounded bg-surface-500/10 px-1 py-0.5">{sync_sync_path()}</code>.
						</p>

						<div class="grid gap-2 md:grid-cols-3">
							<div class="rounded-md border border-surface-500/20 bg-surface-500/10 p-3">
								<div class="flex items-center gap-1.5 text-sm font-semibold">
									<iconify-icon
										icon="mdi:export"
										width="16"
										class="text-tertiary-500 dark:text-primary-500"
										aria-hidden="true"
									></iconify-icon>
									{sync_step_export_title()}
								</div>
								<p class="mt-1 text-xs text-(--admin-text-muted)">{sync_step_export_desc()}</p>
							</div>
							<div class="rounded-md border border-surface-500/20 bg-surface-500/10 p-3">
								<div class="flex items-center gap-1.5 text-sm font-semibold">
									<iconify-icon
										icon="mdi:source-branch"
										width="16"
										class="text-tertiary-500 dark:text-primary-500"
										aria-hidden="true"
									></iconify-icon>
									{sync_step_diff_title()}
								</div>
								<p class="mt-1 text-xs text-(--admin-text-muted)">{sync_step_diff_desc()}</p>
							</div>
							<div class="rounded-md border border-surface-500/20 bg-surface-500/10 p-3">
								<div class="flex items-center gap-1.5 text-sm font-semibold">
									<iconify-icon
										icon="mdi:sync"
										width="16"
										class="text-tertiary-500 dark:text-primary-500"
										aria-hidden="true"
									></iconify-icon>
									{sync_step_apply_title()}
								</div>
								<p class="mt-1 text-xs text-(--admin-text-muted)">{sync_step_apply_desc()}</p>
							</div>
						</div>
					</div>
				{/if}
			</AdminCard>

			<div class="border-b border-(--admin-border-default)">
				<Tabs
					tabs={syncTabs}
					bind:activeTab
					variant="underline"
					ariaLabel={sync_options_aria()}
					testId="sync-tabs"
					onTabChange={(id) => (activeTab = id as SyncTab)}
				/>
			</div>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto pb-4 pe-0.5">
			<AdminCard
				class="flex min-h-full flex-col border border-(--admin-border-default) bg-(--admin-bg-card) p-3 shadow-xs"
			>
				<section id="tabpanel-{activeTab}" role="tabpanel" class="pt-1" transition:fade|local>
					{#if activeTab === 'sync'}
						{#if status?.unmetRequirements && status.unmetRequirements.length > 0}
							<div
								class="alert my-3 rounded-md border border-error-500/30 bg-error-500/10 p-4 text-error-500 dark:border-error-500/40 dark:bg-error-500/20 dark:text-error-400"
								transition:slide
							>
								<h4 class="flex items-center gap-2 font-bold">
									<iconify-icon icon="mdi:alert-circle"></iconify-icon>
									{sync_unmet_heading()}
								</h4>
								<p class="mt-1 text-sm">{sync_unmet_intro()}</p>
								<ul class="mt-2 list-disc ps-5 text-sm">
									{#each status.unmetRequirements as req (`${req.key ?? req.name ?? ''}`)}
										<li>
											<strong>{req.name ?? req.key}</strong>
											{#if req.type}({req.type}){/if}: {req.requirement ??
												'Missing required setting'}
										</li>
									{/each}
								</ul>
							</div>
						{/if}

						<!-- Promotion Safety Mode & Action Bar (single aligned row on desktop) -->
						<div
							class="rounded-lg border border-(--admin-border-default) bg-surface-500/10 p-3 sm:p-4"
						>
							<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
								<!-- Safety Mode Selector -->
								<div class="flex min-w-0 flex-1 flex-col gap-1.5">
									<div class="flex items-center gap-1.5">
										<label
											for="safety-mode-select"
											class="text-xs font-semibold uppercase tracking-wider text-surface-500"
										>
											{sync_safety_mode()}
										</label>
										<SystemTooltip title={sync_safety_mode_tip()}>
											<HelpIcon ariaLabel="Help for promotion safety mode" tabindex={0} />
										</SystemTooltip>
									</div>
									<div class="flex flex-wrap items-center gap-2">
										<select
											id="safety-mode-select"
											aria-label={sync_safety_mode_aria()}
											bind:value={selectedMode}
											class="rounded-md border border-(--admin-border-default) bg-(--admin-bg-card) px-3 py-1.5 text-sm text-(--admin-text-body) focus:outline-hidden focus:ring-2 focus:ring-primary-500"
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
									<p class="text-xs text-surface-500 dark:text-surface-400">
										{modeDescriptions[selectedMode].description}
									</p>
								</div>

								{#if applyBlocked && !isProcessing}
									<p class="text-xs text-(--admin-text-muted) lg:text-end">
										{sync_apply_hint_disabled()}
									</p>
								{/if}
							</div>
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
								<p class="text-surface-500">{sync_in_sync_desc()}</p>
							</div>
						{:else}
							<div class="mt-4 space-y-3" data-testid="sync-changes">
								<div
									class="flex flex-col items-center justify-center gap-1.5 text-center sm:flex-row sm:items-center sm:justify-between sm:text-start"
								>
									<h3
										class="flex items-center justify-center gap-2 text-lg font-semibold sm:justify-start"
									>
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
																<Badge
																	variant="tertiary"
																	class="dark:bg-primary-500 dark:text-white"
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
						<div transition:slide|local class="space-y-4">
							<div class="rounded-lg border border-(--admin-border-default) bg-surface-500/10 p-3">
								<h3 class="flex items-center gap-2 text-sm font-semibold">
									<iconify-icon icon="mdi:database-export-outline"></iconify-icon>
									{sync_backup_heading()}
								</h3>
								<p class="mt-1 text-sm text-(--admin-text-muted)">{sync_backup_intro()}</p>
							</div>

							<!-- Saved Snapshots Table -->
							<div class="space-y-2">
								<div class="flex items-center justify-between gap-2">
									<h4 class="text-sm font-semibold">{sync_snapshots_heading()}</h4>
									<Button
										variant="primary"
										size="sm"
										onclick={exportCurrentConfig}
										loading={isExporting}
										leadingIcon="mdi:file-export"
									>
										{sync_export_schema()}
									</Button>
								</div>

								{#if snapshots.length === 0}
									<div
										class="rounded-lg border border-surface-500/20 bg-surface-500/10 p-6 text-center text-sm text-(--admin-text-muted)"
										data-testid="sync-snapshots-empty"
									>
										{sync_snapshots_empty()}
									</div>
								{:else}
									<AdminCard class="w-full overflow-x-auto border border-(--admin-border-default)">
										<table class={SMART_TABLE} data-testid="sync-snapshots-table">
											<thead class={SMART_TABLE_THEAD}>
												<tr class="border-b border-surface-500/30 text-xs uppercase tracking-wide">
													<th class="{SMART_TABLE_TH} text-start!">{sync_col_snapshot()}</th>
													<th class="{SMART_TABLE_TH} text-start!">{sync_col_adapter()}</th>
													<th class="{SMART_TABLE_TH} text-start!">{sync_col_resources()}</th>
													<th class="{SMART_TABLE_TH} text-end!">{sync_col_created()}</th>
												</tr>
											</thead>
											<tbody class="divide-y divide-surface-200/30 dark:divide-surface-700/30">
												{#each snapshots as snap (snap.dirName)}
													<tr class={SMART_TABLE_ROW_HOVER}>
														<td class="{SMART_TABLE_TD} text-start! font-mono text-xs"
															>{snap.dirName}</td
														>
														<td class="{SMART_TABLE_TD} text-start!">
															<Badge variant="surface">{snap.adapter}</Badge>
														</td>
														<td class="{SMART_TABLE_TD} text-start!">{snap.totalResources}</td>
														<td
															class="{SMART_TABLE_TD} text-end! text-xs text-(--admin-text-muted)"
														>
															{snap.createdAt
																? formatDateTime(snap.createdAt, data.systemLanguage)
																: '-'}
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</AdminCard>
								{/if}
							</div>

							<div class="grid gap-2 md:grid-cols-2">
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
								class="max-h-125 overflow-y-auto whitespace-pre-wrap rounded border border-(--admin-border-default) bg-surface-500/10 p-2 text-xs dark:bg-surface-800">{JSON.stringify(
									status,
									null,
									2
								)}</pre>
						</div>
					{/if}
				</section>
			</AdminCard>
		</div>
	</div>

	{#if activeTab === 'sync'}
		<StickyActions>
			<div class="flex w-full items-center justify-center gap-1.5 sm:justify-end sm:gap-2">
				<SystemTooltip title={sync_export_btn_tip()}>
					<Button
						variant="outline"
						size="sm"
						disabled={isExporting || isLoading}
						onclick={exportCurrentConfig}
						data-testid="config-export-btn"
						leadingIcon="mdi:export"
						class="h-9 shrink-0 whitespace-nowrap sm:h-10 sm:px-4"
					>
						<span class="sm:hidden">{isExporting ? sync_exporting_btn() : 'Export'}</span>
						<span class="hidden sm:inline"
							>{isExporting ? sync_exporting_btn() : sync_export_btn()}</span
						>
					</Button>
				</SystemTooltip>

				<SystemTooltip title={sync_refresh_btn_tip()}>
					<Button
						variant="ghost"
						size="sm"
						disabled={isLoading || isProcessing}
						onclick={loadStatus}
						data-testid="sync-refresh"
						leadingIcon="mdi:refresh"
						aria-label={isLoading ? sync_checking_btn() : sync_refresh_btn()}
						class="size-9 shrink-0 px-0 sm:h-10 sm:w-auto sm:px-4 whitespace-nowrap"
					>
						<span class="hidden sm:inline"
							>{isLoading ? sync_checking_btn() : sync_refresh_btn()}</span
						>
					</Button>
				</SystemTooltip>

				<Button
					variant="primary"
					size="sm"
					disabled={applyBlocked}
					onclick={handleApplyClick}
					data-testid="sync-run"
					leadingIcon="mdi:sync"
					class="h-9 flex-1 whitespace-nowrap sm:h-10 sm:flex-none sm:px-4"
				>
					{isProcessing ? sync_applying_btn() : sync_apply_btn()}
				</Button>
			</div>
		</StickyActions>
	{/if}
</AdminPageShell>

<!-- Destructive Sync Confirmation Modal -->
<Modal bind:open={confirmModalOpen} title={sync_confirm_title()} size="sm">
	<div class="space-y-4 p-2">
		<div
			class="rounded-lg border border-error-500/30 bg-error-500/10 p-3 text-sm text-error-500 dark:text-error-400"
		>
			{sync_confirm_body()}
		</div>
		<div class="flex justify-end gap-3 pt-2">
			<Button variant="ghost" type="button" onclick={() => (confirmModalOpen = false)}>
				{button_cancel()}
			</Button>
			<Button
				variant="danger"
				type="button"
				loading={isProcessing}
				data-testid="confirm-sync-apply-btn"
				onclick={() => void executeSync(true)}
			>
				{sync_apply_btn()}
			</Button>
		</div>
	</div>
</Modal>
