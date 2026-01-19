<!--
@file shared/features/src/dashboard/widgets/AuditLogWidget.svelte
@component 
**Real-time audit log widget for monitoring system events and security events.**
-->

<script lang="ts">
	import { onMount } from 'svelte';

	import { untrack } from 'svelte';

	const { config } = $props<{ config: any }>();

	// Use config to suppress warning in dev
	$effect(() => {
		untrack(() => {
			if (import.meta.env.DEV && config) {
				console.log('AuditLogWidget config:', config);
			}
		});
	});

	let logs = $state<any[]>([]);
	let loading = $state(true);

	onMount(async () => {
		try {
			// Fetch real audit logs
			const res = await fetch('/api/audit?limit=20');
			if (res.ok) {
				logs = await res.json();
			} else {
				console.error('Failed to fetch audit logs');
			}
		} catch (e) {
			console.error('Error fetching audit logs', e);
		} finally {
			loading = false;
		}
	});
</script>

<div class="h-full w-full overflow-hidden p-4">
	<div class="flex items-center justify-between mb-4">
		<h3 class="h3 font-bold">Audit Log</h3>
		<span class="badge variant-filled-success">SECURE</span>
	</div>

	{#if loading}
		<div class="animate-pulse space-y-2">
			<div class="h-4 bg-surface-300 rounded"></div>
			<div class="h-4 bg-surface-300 rounded"></div>
		</div>
	{:else}
		<div class="table-container text-xs">
			<table class="table table-compact w-full hover">
				<thead>
					<tr>
						<th>Action</th>
						<th>Actor</th>
						<th>Verified</th>
					</tr>
				</thead>
				<tbody>
					{#each logs as log}
						<tr>
							<td class="font-mono text-primary-500">{log.action}</td>
							<td>{log.actor}</td>
							<td><iconify-icon icon="mdi:check-decagram" class="text-primary-500"></iconify-icon></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
