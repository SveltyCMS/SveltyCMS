<!--
@file src/routes/setup/ConnectionStatus.svelte
@description Real-time connection status indicator with detailed feedback
-->
<script lang="ts">
	import * as m from '@src/paraglide/messages';

	type ConnectionState = 'idle' | 'testing' | 'success' | 'error';

	type TestResult = {
		success: boolean;
		message?: string;
		error?: string;
		userFriendly?: string;
		latencyMs?: number;
		classification?: string;
		details?: any;
		atlas?: boolean;
		authenticated?: boolean;
		collectionsSample?: string[];
		stats?: {
			collections?: number;
			objects?: number;
			dataSize?: number;
		};
	};

	let { state, result, onRetry } = $props<{
		state: ConnectionState;
		result: TestResult | null;
		onRetry?: () => void;
	}>();

	function getStatusIcon(state: ConnectionState): string {
		if (state === 'testing') return '⏳';
		if (state === 'success') return '✅';
		if (state === 'error') return '❌';
		return '⚪';
	}

	function getStatusColor(state: ConnectionState): string {
		if (state === 'testing') return 'text-blue-600 dark:text-blue-400';
		if (state === 'success') return 'text-emerald-600 dark:text-emerald-400';
		if (state === 'error') return 'text-red-600 dark:text-red-400';
		return 'text-surface-400 dark:text-surface-600';
	}

	function getStatusText(state: ConnectionState, result: TestResult | null): string {
		if (state === 'testing') return m.setup_connection_testing();
		if (state === 'success') return result?.message || m.setup_connection_success();
		if (state === 'error') return result?.userFriendly || result?.error || m.setup_connection_failed();
		return m.setup_connection_ready();
	}

	function formatBytes(bytes: number | undefined): string {
		if (!bytes) return 'N/A';
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
	}

	function getTroubleshootingTips(classification: string | undefined): string[] {
		switch (classification) {
			case 'atlas_ip_whitelist':
				return [
					m.setup_troubleshoot_atlas_ip_1(),
					m.setup_troubleshoot_atlas_ip_2(),
					m.setup_troubleshoot_atlas_ip_3(),
					m.setup_troubleshoot_atlas_ip_4(),
					m.setup_troubleshoot_atlas_ip_5()
				];
			case 'atlas_cluster_not_found':
				return [
					m.setup_troubleshoot_cluster_1(),
					m.setup_troubleshoot_cluster_2(),
					m.setup_troubleshoot_cluster_3(),
					m.setup_troubleshoot_cluster_4()
				];
			case 'atlas_user_not_found':
				return [
					m.setup_troubleshoot_user_1(),
					m.setup_troubleshoot_user_2(),
					m.setup_troubleshoot_user_3(),
					m.setup_troubleshoot_user_4(),
					m.setup_troubleshoot_user_5()
				];
			case 'authentication_failed':
			case 'wrong_password':
				return [
					m.setup_troubleshoot_auth_1(),
					m.setup_troubleshoot_auth_2(),
					m.setup_troubleshoot_auth_3(),
					m.setup_troubleshoot_auth_4(),
					m.setup_troubleshoot_auth_5()
				];
			case 'credentials_required':
			case 'auth_required':
				return [m.setup_troubleshoot_creds_1(), m.setup_troubleshoot_creds_2(), m.setup_troubleshoot_creds_3(), m.setup_troubleshoot_creds_4()];
			case 'host_unreachable':
			case 'connection_refused':
				return [
					m.setup_troubleshoot_host_1(),
					m.setup_troubleshoot_host_2(),
					m.setup_troubleshoot_host_3(),
					m.setup_troubleshoot_host_4(),
					m.setup_troubleshoot_host_5()
				];
			case 'database_not_found':
				return [m.setup_troubleshoot_dbnotfound_1(), m.setup_troubleshoot_dbnotfound_2(), m.setup_troubleshoot_dbnotfound_3()];
			case 'timeout':
				return [
					m.setup_troubleshoot_timeout_1(),
					m.setup_troubleshoot_timeout_2(),
					m.setup_troubleshoot_timeout_3(),
					m.setup_troubleshoot_timeout_4(),
					m.setup_troubleshoot_timeout_5()
				];
			default:
				return [
					m.setup_troubleshoot_default_1(),
					m.setup_troubleshoot_default_2(),
					m.setup_troubleshoot_default_3(),
					m.setup_troubleshoot_default_4(),
					m.setup_troubleshoot_default_5()
				];
		}
	}
</script>

<div
	class="rounded-lg border transition-colors {state === 'success'
		? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
		: state === 'error'
			? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
			: state === 'testing'
				? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'
				: 'border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-800/50'}"
>
	<!-- Status Header -->
	<div class="p-4">
		<div class="flex items-center gap-3">
			<span class="text-2xl {state === 'testing' ? 'animate-pulse' : ''}">
				{getStatusIcon(state)}
			</span>
			<div class="flex-1">
				<p class="font-semibold {getStatusColor(state)}">
					{getStatusText(state, result)}
				</p>
				{#if result?.latencyMs && state === 'success'}
					<p class="text-sm text-surface-600 dark:text-surface-400">
						{m.setup_connection_latency({ ms: result.latencyMs })}
					</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Success Details -->
	{#if state === 'success' && result}
		<div class="border-t border-emerald-200 bg-white p-4 dark:border-emerald-800 dark:bg-surface-800">
			<div class="grid gap-3 text-sm">
				{#if result.atlas}
					<div class="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
						<span>☁️</span>
						<span class="font-medium">{m.setup_connection_mongodb_atlas()}</span>
					</div>
				{/if}

				{#if result.authenticated}
					<div class="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
						<span>🔒</span>
						<span class="font-medium">{m.setup_connection_authenticated()}</span>
					</div>
				{/if}

				{#if result.stats}
					<div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-900/50">
						<p class="mb-2 font-semibold text-surface-900 dark:text-surface-50">{m.setup_connection_stats_title()}</p>
						<div class="grid gap-1 text-surface-600 dark:text-surface-400">
							{#if result.stats.collections !== undefined}
								<div class="flex justify-between">
									<span>{m.setup_connection_stats_collections({ count: result.stats.collections })}</span>
								</div>
							{/if}
							{#if result.stats.objects !== undefined}
								<div class="flex justify-between">
									<span>{m.setup_connection_stats_objects({ count: result.stats.objects.toLocaleString() })}</span>
								</div>
							{/if}
							{#if result.stats.dataSize !== undefined}
								<div class="flex justify-between">
									<span>{m.setup_connection_stats_size({ size: formatBytes(result.stats.dataSize) })}</span>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				{#if result.collectionsSample && result.collectionsSample.length > 0}
					<div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-900/50">
						<p class="mb-2 font-semibold text-surface-900 dark:text-surface-50">{m.setup_connection_sample_collections()}</p>
						<div class="flex flex-wrap gap-2">
							{#each result.collectionsSample as collection}
								<span class="rounded bg-indigo-100 px-2 py-1 font-mono text-xs text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
									{collection}
								</span>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Error Details with Troubleshooting -->
	{#if state === 'error' && result}
		<div class="border-t border-red-200 bg-white p-4 dark:border-red-800 dark:bg-surface-800">
			<!-- Technical Error Message -->
			{#if result.error && result.error !== result.userFriendly}
				<div class="mb-3 rounded-lg bg-surface-50 p-3 dark:bg-surface-900/50">
					<p class="mb-1 text-xs font-semibold uppercase text-surface-500 dark:text-surface-400">{m.setup_connection_technical_details()}</p>
					<p class="font-mono text-xs text-surface-600 dark:text-surface-400">
						{result.error}
					</p>
				</div>
			{/if}

			<!-- Troubleshooting Tips -->
			{#if result.classification}
				<div class="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
					<p class="mb-2 flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-100">
						<span>💡</span>
						<span>{m.setup_connection_troubleshooting()}</span>
					</p>
					<ul class="space-y-1.5 text-sm text-amber-800 dark:text-amber-200">
						{#each getTroubleshootingTips(result.classification) as tip}
							<li class="flex gap-2">
								<span class="text-amber-600 dark:text-amber-400">•</span>
								<span>{tip}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Retry Button -->
			{#if onRetry}
				<div class="mt-3 flex justify-end">
					<button onclick={onRetry} class="variant-ghost-surface btn btn-sm flex items-center gap-2">
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
							/>
						</svg>
						{m.setup_connection_retry()}
					</button>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Testing Animation -->
	{#if state === 'testing'}
		<div class="border-t border-blue-200 bg-white p-4 dark:border-blue-800 dark:bg-surface-800">
			<div class="flex items-center gap-3">
				<div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700">
					<div class="h-full w-1/3 animate-[slide_1.5s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"></div>
				</div>
				<span class="text-sm text-surface-600 dark:text-surface-400">{m.setup_connection_connecting()}</span>
			</div>
		</div>
	{/if}
</div>

<style>
	@keyframes slide {
		0% {
			transform: translateX(-100%);
		}
		50% {
			transform: translateX(300%);
		}
		100% {
			transform: translateX(-100%);
		}
	}
</style>
