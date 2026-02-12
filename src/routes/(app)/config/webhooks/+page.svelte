<!--
@files src/routes/(app)/config/webhooks/+page.svelte
@component
**This file sets up and displays the webhooks page. It provides a user-friendly interface for managing webhooks.**
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import PageTitle from '@components/PageTitle.svelte';
	import { showToast } from '@utils/toast';
	import type { Webhook } from '@src/services/webhookService';

	let webhooks: Webhook[] = $state([]);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let showModal = $state(false);
	let editingWebhook: Partial<Webhook> | null = $state(null);

	const eventTypes = ['entry:create', 'entry:update', 'entry:delete', 'entry:publish', 'entry:unpublish', 'media:upload', 'media:delete'];

	async function loadWebhooks() {
		isLoading = true;
		try {
			const res = await fetch('/api/webhooks');
			const result = await res.json();
			if (result.success) {
				webhooks = result.data;
			} else {
				showToast(result.message || 'Failed to load webhooks', 'error');
			}
		} catch (_err) {
			showToast('Error loading webhooks', 'error');
		} finally {
			isLoading = false;
		}
	}

	async function saveWebhook() {
		if (!editingWebhook?.url || !editingWebhook?.name) {
			showToast('Name and URL are required', 'warning');
			return;
		}

		isSaving = true;
		try {
			const method = editingWebhook.id ? 'PATCH' : 'POST';
			const url = editingWebhook.id ? `/api/webhooks/${editingWebhook.id}` : '/api/webhooks';

			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(editingWebhook)
			});
			const result = await res.json();

			if (result.success) {
				showToast(`Webhook ${editingWebhook.id ? 'updated' : 'created'} successfully`, 'success');
				showModal = false;
				await loadWebhooks();
			} else {
				showToast(result.message || 'Failed to save webhook', 'error');
			}
		} catch (_err) {
			showToast('Error saving webhook', 'error');
		} finally {
			isSaving = false;
		}
	}

	async function deleteWebhook(id: string) {
		if (!confirm('Are you sure you want to delete this webhook?')) return;

		try {
			const res = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
			const result = await res.json();
			if (result.success) {
				showToast('Webhook deleted', 'success');
				await loadWebhooks();
			}
		} catch (_err) {
			showToast('Error deleting webhook', 'error');
		}
	}

	async function testWebhook(webhook: Webhook) {
		showToast(`Sending test payload to ${webhook.name}...`, 'info');
		try {
			const res = await fetch(`/api/webhooks/${webhook.id}/test`, { method: 'POST' });
			const result = await res.json();
			if (result.success) {
				showToast('Test webhook sent successfully!', 'success');
			} else {
				showToast(result.message || 'Webhook test failed', 'error');
			}
		} catch (_err) {
			showToast('Error testing webhook', 'error');
		}
	}

	function openAddModal() {
		editingWebhook = {
			name: '',
			url: '',
			active: true,
			events: ['entry:publish'],
			secret: crypto.randomUUID().replace(/-/g, '')
		};
		showModal = true;
	}

	function openEditModal(webhook: Webhook) {
		editingWebhook = { ...webhook };
		showModal = true;
	}

	function toggleEvent(event: string) {
		if (!editingWebhook) return;
		const events = editingWebhook.events || [];
		if (events.includes(event as any)) {
			editingWebhook.events = events.filter((e) => e !== event);
		} else {
			editingWebhook.events = [...events, event as any];
		}
	}

	onMount(loadWebhooks);
</script>

<PageTitle name="Webhooks" icon="mdi:webhook" showBackButton={true} backUrl="/config" />

<div class="wrapper p-4">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h2 class="h2 font-bold">Manage Webhooks</h2>
			<p class="text-surface-600 dark:text-surface-400">Trigger external HTTP callbacks on CMS events.</p>
		</div>
		<button class="preset-filled-primary-500 btn" onclick={openAddModal}>
			<iconify-icon icon="mdi:plus"></iconify-icon>
			<span>Add Webhook</span>
		</button>
	</div>

	{#if isLoading}
		<div class="flex flex-col items-center justify-center py-20 grayscale opacity-50">
			<iconify-icon icon="mdi:webhook" class="text-6xl animate-pulse"></iconify-icon>
			<p class="mt-4">Loading webhooks...</p>
		</div>
	{:else if webhooks.length === 0}
		<div class="preset-tonal-surface p-12 text-center rounded-lg border-2 border-dashed border-surface-300 dark:border-surface-700">
			<iconify-icon icon="mdi:webhook-off" class="text-6xl mb-4 opacity-20"></iconify-icon>
			<h3 class="h3 font-bold">No Webhooks Configured</h3>
			<p class="mb-6 opacity-60">Add a webhook to start integrating with external systems.</p>
			<button class="btn preset-filled-primary-500" onclick={openAddModal}>Get Started</button>
		</div>
	{:else}
		<div class="grid gap-4">
			{#each webhooks as webhook (webhook.id)}
				<div
					class="card p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-primary-500 transition-colors"
				>
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2 mb-1">
							<span class="font-bold text-lg truncate">{webhook.name}</span>
							{#if webhook.active}
								<span class="badge preset-filled-success-500 text-[10px] uppercase">Active</span>
							{:else}
								<span class="badge preset-tonal-surface text-[10px] uppercase">Disabled</span>
							{/if}
						</div>
						<div class="text-xs font-mono opacity-60 truncate mb-2">{webhook.url}</div>
						<div class="flex flex-wrap gap-1">
							{#each webhook.events as event (event)}
								<span class="badge preset-tonal-primary text-[10px]">{event}</span>
							{/each}
						</div>
					</div>

					<div
						class="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-surface-200 dark:border-surface-700"
					>
						<button
							class="btn btn-sm preset-tonal-surface"
							onclick={() => testWebhook(webhook as Webhook)}
							title="Send Test Event"
							aria-label="Test Webhook"
						>
							<iconify-icon icon="mdi:send-outline"></iconify-icon>
							<span class="hidden sm:inline">Test</span>
						</button>
						<button
							class="btn btn-sm preset-tonal-surface"
							onclick={() => openEditModal(webhook)}
							title="Edit Configuration"
							aria-label="Edit Webhook"
						>
							<iconify-icon icon="mdi:pencil-outline"></iconify-icon>
							<span class="hidden sm:inline">Edit</span>
						</button>
						<button
							class="btn btn-sm preset-tonal-error"
							onclick={() => deleteWebhook(webhook.id)}
							title="Delete Webhook"
							aria-label="Delete Webhook"
						>
							<iconify-icon icon="mdi:trash-can-outline"></iconify-icon>
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Webhook Editor Modal -->
{#if showModal && editingWebhook}
	{@const activeWebhook = editingWebhook}
	<div class="fixed inset-0 z-1000 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade>
		<div
			class="card bg-surface-100 dark:bg-surface-800 w-full max-w-2xl overflow-hidden shadow-2xl border border-surface-300 dark:border-surface-700"
			transition:slide
		>
			<header class="p-4 border-b border-surface-300 dark:border-surface-700 flex justify-between items-center bg-surface-200 dark:bg-surface-900">
				<h3 class="h3 font-bold">{activeWebhook.id ? 'Edit Webhook' : 'Add New Webhook'}</h3>
				<button class="btn btn-sm variant-ghost" onclick={() => (showModal = false)} aria-label="Close modal">
					<iconify-icon icon="mdi:close" class="text-xl"></iconify-icon>
				</button>
			</header>

			<section class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
				<label class="label">
					<span>Webhook Name</span>
					<input type="text" class="input" placeholder="e.g. My External API" bind:value={activeWebhook.name} />
				</label>

				<label class="label">
					<span>Payload URL</span>
					<input type="url" class="input" placeholder="https://example.com/webhook" bind:value={activeWebhook.url} />
				</label>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<label class="label text-sm">
						<span>Secret Key (HMAC-SHA256)</span>
						<div class="flex gap-1">
							<input type="text" class="input font-mono text-xs" bind:value={activeWebhook.secret} />
							<button
								class="btn variant-ghost-surface btn-sm"
								onclick={() => activeWebhook && (activeWebhook.secret = crypto.randomUUID().replace(/-/g, ''))}
								aria-label="Regenerate secret"
							>
								<iconify-icon icon="mdi:refresh"></iconify-icon>
							</button>
						</div>
						<p class="text-[10px] opacity-60 mt-1 italic">Used to sign payloads for security verify.</p>
					</label>

					<div class="space-y-2">
						<span class="block text-sm">Status</span>
						<label class="flex items-center gap-2 cursor-pointer">
							<input type="checkbox" class="checkbox" bind:checked={activeWebhook.active} />
							<span>Active (Enabled)</span>
						</label>
					</div>
				</div>

				<hr class="opacity-30" />

				<div class="space-y-2">
					<span class="block font-bold">Trigger Events</span>
					<p class="text-xs opacity-60 mb-2">Select which events should trigger this webhook.</p>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
						{#each eventTypes as event (event)}
							<label class="flex items-center gap-2 cursor-pointer hover:bg-surface-200 dark:hover:bg-surface-700 p-2 rounded transition-colors">
								<input type="checkbox" class="checkbox" checked={activeWebhook.events?.includes(event as any)} onchange={() => toggleEvent(event)} />
								<span class="text-sm">{event}</span>
							</label>
						{/each}
					</div>
				</div>
			</section>

			<footer class="p-4 border-t border-surface-300 dark:border-surface-700 flex justify-end gap-2 bg-surface-50 dark:bg-surface-900">
				<button class="btn variant-ghost-surface" onclick={() => (showModal = false)}>Cancel</button>
				<button class="btn preset-filled-primary-500" disabled={isSaving} onclick={saveWebhook}>
					{#if isSaving}
						<iconify-icon icon="mdi:loading" class="animate-spin"></iconify-icon>
						<span>Saving...</span>
					{:else}
						<iconify-icon icon="mdi:content-save"></iconify-icon>
						<span>{activeWebhook.id ? 'Save Changes' : 'Create Webhook'}</span>
					{/if}
				</button>
			</footer>
		</div>
	</div>
{/if}

<style>
	.wrapper {
		max-width: 1000px;
		margin: 0 auto;
	}
</style>
