<!--
@file src/components/audit/audit-history.svelte
@component AuditHistory – Displays chained audit logs for a content item with verification UI
@features
- Filtered audit log list for a specific content entry
- Visual cryptographic chain indicator (connected dots with colors)
- "Verify Chain" button that validates SHA-256 integrity
- Shows timestamp, actor, action, and details
- Multi-tenant aware with chain verification scoping
- Accessible: keyboard navigable, ARIA-live regions for verification results
-->

<script lang="ts">
	import { queryAuditLogs, verifyAuditChain } from '@src/routes/(app)/audit-history.remote';
	import { collectionValue } from '@src/stores/collection-store.svelte';
	import Button from '@components/ui/button.svelte';

	interface AuditLogEntry {
		_id?: string;
		action: string;
		timestamp?: string;
		actorEmail?: string;
		actorRole?: string;
		details?: Record<string, unknown>;
		previousHash?: string;
		chainHash?: string;
	}

	interface ChainVerificationResult {
		valid: boolean;
		brokenAt: number | null;
		totalEntries: number;
		tamperedEntries: number;
		details?: string[];
	}

	interface Props {
		/** Optional content entry ID to filter audit logs for */
		entryId?: string;
		/** Maximum number of logs to display */
		limit?: number;
	}

	const { entryId, limit = 50 }: Props = $props();

	let logs = $state<AuditLogEntry[]>([]);
	let isLoading = $state(false);
	let verifyResult = $state<ChainVerificationResult | null>(null);
	let isVerifying = $state(false);
	let error = $state<string | null>(null);

	// Derive target ID from current entry or props
	let targetId = $derived(
		entryId ?? (collectionValue.value as Record<string, unknown>)?._id as string | undefined,
	);

	/** Load audit logs for the current/target entry */
	async function loadLogs() {
		if (!targetId) return;

		isLoading = true;
		error = null;

		try {
			const result = await queryAuditLogs({ targetId, limit });
			if (result.success) {
				logs = (result.data ?? []) as AuditLogEntry[];
			} else {
				error = result.message ?? 'Failed to load audit logs';
			}
		} catch (err) {
			error = String(err);
		} finally {
			isLoading = false;
		}
	}

	/** Verify the audit chain integrity */
	async function handleVerifyChain() {
		isVerifying = true;
		verifyResult = null;
		try {
			verifyResult = await verifyAuditChain({});
		} catch (err) {
			verifyResult = {
				valid: false,
				brokenAt: null,
				totalEntries: 0,
				tamperedEntries: 0,
				details: [String(err)],
			};
		} finally {
			isVerifying = false;
		}
	}

	/** Format a timestamp for display */
	function formatTimestamp(ts: string | undefined): string {
		if (!ts) return '-';
		try {
			return new Date(ts).toLocaleString(undefined, {
				year: 'numeric',
				month: 'short',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
			});
		} catch {
			return ts;
		}
	}

	/** Truncate long strings for display */
	function truncate(str: string, maxLen = 60): string {
		if (str.length <= maxLen) return str;
		return str.slice(0, maxLen) + '...';
	}

	// Load logs when targetId changes
	$effect(() => {
		if (targetId) {
			loadLogs();
		} else {
			logs = [];
		}
	});
</script>

<div class="audit-history flex flex-col gap-3">
	<!-- Header with verify button -->
	<div class="flex items-center justify-between">
		<h3 class="text-sm font-semibold text-surface-600 dark:text-surface-300">
			Audit History
		</h3>
		<Button
			variant="ghost"
			onclick={handleVerifyChain}
			disabled={isVerifying}
			class="rounded px-2 py-1 text-xs font-medium transition-colors {isVerifying
				? 'cursor-wait bg-surface-200 text-surface-500 dark:bg-surface-700 dark:text-surface-400'
				: 'bg-tertiary-100 text-tertiary-700 hover:bg-tertiary-200 dark:bg-tertiary-900/30 dark:text-tertiary-400 dark:hover:bg-tertiary-900/50'}"
			aria-label="Verify audit chain integrity"
		>
			{#if isVerifying}
				<span class="inline-block animate-spin">⟳</span>
				Verifying...
			{:else}
				🔗 Verify Chain
			{/if}
		</Button>
	</div>

	<!-- Verification result -->
	{#if verifyResult}
		<div
			class="rounded border p-2 text-xs {verifyResult.valid
				? 'border-success-300 bg-success-50 text-success-700 dark:border-success-700 dark:bg-success-900/20 dark:text-success-400'
				: 'border-error-300 bg-error-50 text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-400'}"
			role="status"
			aria-live="polite"
			aria-atomic="true"
		>
			{#if verifyResult.valid}
				<div class="flex items-center gap-1.5 font-semibold">
					<span>✅</span>
					Chain Valid — {verifyResult.totalEntries} entries verified
				</div>
			{:else}
				<div class="flex flex-col gap-1">
					<div class="flex items-center gap-1.5 font-semibold">
						<span>⚠️</span>
						Chain Broken at entry #{verifyResult.brokenAt ?? '?'} — {verifyResult.tamperedEntries} of {verifyResult.totalEntries} entries tampered
					</div>
					{#if verifyResult.details && verifyResult.details.length > 0}
						<div class="mt-1 space-y-0.5 ps-4">
							{#each verifyResult.details as detail, i (i)}
								<div class="text-[11px] opacity-80">{detail}</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Loading state -->
	{#if isLoading}
		<div class="flex items-center justify-center py-6 text-xs text-surface-400">
			<span class="inline-block animate-spin me-2">⟳</span>
			Loading audit logs...
		</div>
	{:else if error}
		<div
			class="rounded border border-error-300 bg-error-50 p-2 text-xs text-error-600 dark:border-error-700 dark:bg-error-900/20 dark:text-error-400"
		>
			{error}
		</div>
	{:else if logs.length === 0 && targetId}
		<div class="py-4 text-center text-xs text-surface-400">
			No audit logs found for this entry.
		</div>
	{:else if !targetId}
		<div class="py-4 text-center text-xs text-surface-400">
			Select an entry to view its audit history.
		</div>
	{:else}
		<!-- Audit log list with chain indicators -->
		<div class="flex flex-col gap-0">
			{#each logs as log, index (log._id ?? index)}
				{@const isLast = index === logs.length - 1}
				{@const previousHash = (log as unknown as Record<string, unknown>).previousHash as string | undefined}
				{@const chainHash = (log as unknown as Record<string, unknown>).chainHash as string | undefined}
				{@const hasChain = Boolean(previousHash && chainHash)}

				<div class="flex gap-2">
					<!-- Chain indicator dots -->
					<div class="flex shrink-0 flex-col items-center" style="width: 16px;">
						<div
							class="{hasChain
								? 'h-2.5 w-2.5 rounded-full border border-tertiary-400 bg-tertiary-200 dark:border-tertiary-600 dark:bg-tertiary-800'
								: 'h-2.5 w-2.5 rounded-full border border-surface-300 bg-surface-100 dark:border-surface-600 dark:bg-surface-800'}"
							title="{hasChain
								? `Chain: ${chainHash!.slice(0, 16)}...`
								: 'No chain data'}"
						></div>
						{#if !isLast}
							<div class="h-full min-h-5 w-px bg-surface-300 dark:bg-surface-600"></div>
						{/if}
					</div>

					<!-- Log entry content -->
					<div class="flex flex-1 flex-col gap-0.5 pb-3">
						<div class="flex items-center gap-1.5 text-xs">
							<span
								class="font-semibold text-tertiary-600 dark:text-tertiary-400"
							>
								{log.action}
							</span>
							<span class="text-[10px] text-surface-400">
								{formatTimestamp(log.timestamp)}
							</span>
						</div>

						<div class="flex flex-wrap items-center gap-1 text-[11px] text-surface-500 dark:text-surface-400">
							{#if log.actorEmail}
								<span class="font-medium">{log.actorEmail}</span>
							{/if}
							{#if log.actorRole}
								<span class="rounded bg-surface-200 px-1 py-0.5 text-[10px] dark:bg-surface-700">
									{log.actorRole}
								</span>
							{/if}
						</div>

						{#if log.details && Object.keys(log.details).length > 0}
							<div class="mt-0.5 text-[10px] text-surface-400 dark:text-surface-500">
								{truncate(JSON.stringify(log.details))}
							</div>
						{/if}

						<!-- Chain hash preview -->
						{#if hasChain}
							<div class="mt-0.5 font-mono text-[9px] text-surface-300 dark:text-surface-600" title={chainHash}>
								← {previousHash!.slice(0, 8)}... | {chainHash!.slice(0, 8)}...
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
