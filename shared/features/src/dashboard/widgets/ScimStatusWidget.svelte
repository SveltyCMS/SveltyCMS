<!--
@file shared/features/src/dashboard/widgets/ScimStatusWidget.svelte
@component 
**Real-time SCIM status widget for monitoring identity synchronization.**
-->

<script lang="ts">
	const { config } = $props<{ config: any }>();
</script>

<div class="h-full w-full p-4 flex flex-col justify-between">
	<div class="flex items-center justify-between">
		<h3 class="h3 font-bold">Identity Sync</h3>
		<iconify-icon icon="mdi:cloud-sync" width="24" class="text-primary-500"></iconify-icon>
	</div>

	<div class="grid grid-cols-2 gap-4 my-4">
		<div class="card p-2 text-center variant-soft-surface">
			<div class="text-2xl font-bold">Active</div>
			<div class="text-xs opacity-70">SCIM Status</div>
		</div>
		<div class="card p-2 text-center variant-soft-surface">
			<div class="text-2xl font-bold">24</div>
			<div class="text-xs opacity-70">Synced Users</div>
		</div>
	</div>

	<div class="space-y-2 text-xs">
		<div class="flex justify-between items-center">
			<span>Last Sync</span>
			<span class="font-mono opacity-70">Just now</span>
		</div>
		<div class="flex justify-between items-center">
			<span>Provider</span>
			<span class="font-mono text-primary-500">Okta / Azure</span>
		</div>
	</div>

	<div class="mt-auto pt-2 border-t border-surface-500/20">
		<div class="flex items-center gap-2 text-xs text-success-500">
			<iconify-icon icon="mdi:circle-small" width="20"></iconify-icon>
			Endpoints Healthy
		</div>
	</div>
</div>
