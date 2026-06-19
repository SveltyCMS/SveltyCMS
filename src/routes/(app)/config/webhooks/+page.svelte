<!--
@files src/routes/(app)/config/webhooks/+page.svelte
@component
**This file sets up and displays the webhooks page. It provides a user-friendly interface for managing webhooks.**
-->
<script lang="ts">
import type { Webhook } from "@src/services/background/webhook-service";
import { toast } from "@src/stores/toast.svelte.ts";
import { onMount } from "svelte";
import { fade, slide } from "svelte/transition";
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import Input from '@components/ui/input.svelte';
	import Loader from '@components/ui/loader.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import AdminPageShell from '@components/admin-page-shell.svelte';

let webhooks: Webhook[] = $state([]);
let isLoading = $state(true);
let isSaving = $state(false);
let showModal = $state(false);
let editingWebhook: Partial<Webhook> | null = $state(null);

const eventTypes = [
	"entry:create",
	"entry:update",
	"entry:delete",
	"entry:publish",
	"entry:unpublish",
	"media:upload",
	"media:delete",
];

async function loadWebhooks() {
	isLoading = true;
	try {
		const res = await fetch("/api/webhooks");
		const result = await res.json();
		if (result.success) {
			webhooks = result.data;
		} else {
			toast.error(result.message || "Failed to load webhooks");
		}
	} catch (_err) {
		toast.error("Error loading webhooks");
	} finally {
		isLoading = false;
	}
}

async function saveWebhook() {
	if (!(editingWebhook?.url && editingWebhook?.name)) {
		toast.warning("Name and URL are required");
		return;
	}

	isSaving = true;
	try {
		const method = editingWebhook.id ? "PATCH" : "POST";
		const url = editingWebhook.id
			? `/api/webhooks/${editingWebhook.id}`
			: "/api/webhooks";

		const res = await fetch(url, {
			method,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(editingWebhook),
		});
		const result = await res.json();

		if (result.success) {
			toast.success(
				`Webhook ${editingWebhook.id ? "updated" : "created"} successfully`,
			);
			showModal = false;
			await loadWebhooks();
		} else {
			toast.error(result.message || "Failed to save webhook");
		}
	} catch (_err) {
		toast.error("Error saving webhook");
	} finally {
		isSaving = false;
	}
}

async function deleteWebhook(id: string) {
	if (!confirm("Are you sure you want to delete this webhook?")) {
		return;
	}

	try {
		const res = await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
		const result = await res.json();
		if (result.success) {
			toast.success("Webhook deleted");
			await loadWebhooks();
		}
	} catch (_err) {
		toast.error("Error deleting webhook");
	}
}

async function testWebhook(webhook: Webhook) {
	toast.info(`Sending test payload to ${webhook.name}...`);
	try {
		const res = await fetch(`/api/webhooks/${webhook.id}/test`, {
			method: "POST",
		});
		const result = await res.json();
		if (result.success) {
			toast.success("Test webhook sent successfully!");
		} else {
			toast.error(result.message || "Webhook test failed");
		}
	} catch (_err) {
		toast.error("Error testing webhook");
	}
}

function openAddModal() {
	editingWebhook = {
		name: "",
		url: "",
		active: true,
		events: ["entry:publish"],
		secret: crypto.randomUUID().replace(/-/g, ""),
	};
	showModal = true;
}

function openEditModal(webhook: Webhook) {
	editingWebhook = { ...webhook };
	showModal = true;
}

function toggleEvent(event: string) {
	if (!editingWebhook) {
		return;
	}
	const events = editingWebhook.events || [];
	if (events.includes(event as any)) {
		editingWebhook.events = events.filter((e) => e !== event);
	} else {
		editingWebhook.events = [...events, event as any];
	}
}

onMount(loadWebhooks);
</script>

<AdminPageShell
		title="Webhooks"
		icon="mdi:webhook"
		description="Manage webhook endpoints and event subscriptions"
		showBackButton={true}
		backUrl="/config"
	>
	{#snippet actions()}
		<Button variant="tertiary" onclick={openAddModal} aria-label="Add webhook" leadingIcon="mdi:plus" class="dark:">
			Add Webhook
		</Button>
	{/snippet}

	{#if isLoading}
		<AdminCard class="p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/40 backdrop-blur-md shadow-xs">
			<div class="flex flex-col items-center justify-center py-20">
				<Loader variant="text" lines={2} lastLineWidth="50%" ariaLabel="Loading webhooks" />
			</div>
		</AdminCard>
	{:else if webhooks.length === 0}
		<div in:fade>
		<AdminCard
			class="p-12 text-center border-2 border-dashed border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-900/40 backdrop-blur-md shadow-xs"
		>
			<iconify-icon icon="mdi:webhook-off" class="text-6xl mb-4 opacity-20"></iconify-icon>
			<h3 class="h3 font-bold">No Webhooks Configured</h3>
			<p class="mb-6 opacity-60">Add a webhook to start integrating with external systems.</p>
			<Button variant="tertiary" onclick={openAddModal} aria-label="Add webhook" class="dark:">Get Started</Button>
		</AdminCard>
		</div>
	{:else}
		<div in:fade>
		<AdminCard
			class="p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/40 backdrop-blur-md shadow-xs space-y-4"
		>
			<div class="grid gap-4">
				{#each webhooks as webhook (webhook.id)}
					<AdminCard
						class="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-tertiary-500 dark:hover:border-primary-500 transition-colors"
					>
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2 mb-1">
								<span class="font-bold text-lg truncate">{webhook.name}</span>
								{#if webhook.active}
									<Badge variant="success" size="sm" class="uppercase">Active</Badge>
								{:else}
									<Badge preset="tonal" color="surface" size="sm" class="uppercase">Disabled</Badge>
								{/if}
							</div>
							<div class="text-xs font-mono opacity-60 truncate mb-2">{webhook.url}</div>
							<div class="flex flex-wrap gap-1">
								{#each webhook.events as event (event)}
									<Badge preset="tonal" color="primary" size="sm">{event}</Badge>
								{/each}
							</div>
						</div>

						<div
							class="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-surface-200 dark:border-surface-700"
						>
							<Button variant="surface"
								onclick={() => testWebhook(webhook as Webhook)}
								title="Send Test Event"
								aria-label="Test Webhook"
							 size="sm">
								<iconify-icon icon="mdi:send-outline"></iconify-icon>
								<span class="hidden sm:inline">Test</span>
							</Button>
							<Button variant="surface"
								onclick={() => openEditModal(webhook)}
								title="Edit Configuration"
								aria-label="Edit Webhook"
							 size="sm">
								<iconify-icon icon="mdi:pencil-outline"></iconify-icon>
								<span class="hidden sm:inline">Edit</span>
							</Button>
							<Button variant="error"
								onclick={() => deleteWebhook(webhook.id)}
								title="Delete Webhook"
								aria-label="Delete Webhook"
							 size="sm">
								<iconify-icon icon="mdi:trash-can-outline"></iconify-icon>
							</Button>
							</div>
						</AdminCard>
					{/each}
			</div>
		</AdminCard>
		</div>
	{/if}
</AdminPageShell>

{#if showModal && editingWebhook}
	{const activeWebhook = editingWebhook}
	<div class="fixed inset-0 z-1000 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade>
		<div transition:slide class="w-full max-w-2xl">
		<AdminCard
			class="bg-surface-100 dark:bg-surface-800 w-full overflow-hidden shadow-2xl border border-surface-300 dark:border-surface-700"
		>
			<header class="p-4 border-b border-surface-300 dark:border-surface-700 flex justify-between items-center bg-surface-200 dark:bg-surface-900">
				<h3 class="h3 font-bold">{activeWebhook.id ? 'Edit Webhook' : 'Add New Webhook'}</h3>
				<Button variant="ghost" onclick={() => (showModal = false)} aria-label="Close modal" size="sm">
					<iconify-icon icon="mdi:close" class="text-xl"></iconify-icon>
				</Button>
			</header>

			<section class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
				<Input
					label="Webhook Name"
					type="text"
					placeholder="e.g. My External API"
					bind:value={activeWebhook.name}
				/>

				<Input
					label="Payload URL"
					type="url"
					placeholder="https://example.com/webhook"
					bind:value={activeWebhook.url}
				/>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div class="space-y-1">
						<span class="text-sm font-semibold text-surface-700 dark:text-surface-300">Secret Key (HMAC-SHA256)</span>
						<div class="flex gap-1">
							<Input
								type="text"
								bind:value={activeWebhook.secret}
								aria-label="Secret key"
								inputClass="font-mono text-xs"
								class="flex-1"
							/>
							<Button variant="ghost"
								onclick={() => activeWebhook && (activeWebhook.secret = crypto.randomUUID().replace(/-/g, ''))}
								aria-label="Regenerate secret"
							 size="sm">
								<iconify-icon icon="mdi:refresh"></iconify-icon>
							</Button>
						</div>
						<p class="text-[10px] opacity-60 mt-1 italic">Used to sign payloads for security verify.</p>
					</div>

					<div class="space-y-2">
						<Checkbox bind:checked={activeWebhook.active} label="Active (Enabled)" />
					</div>
				</div>

				<hr class="opacity-30" />

				<div class="space-y-2">
					<span class="block font-bold">Trigger Events</span>
					<p class="text-xs opacity-60 mb-2">Select which events should trigger this webhook.</p>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
						{#each eventTypes as event (event)}
							<div class="hover:bg-surface-200 dark:hover:bg-surface-700 p-2 rounded transition-colors">
								<Checkbox
									checked={activeWebhook.events?.includes(event as any) ?? false}
									onchange={() => toggleEvent(event)}
									label={event}
								/>
							</div>
						{/each}
					</div>
				</div>
			</section>

			<footer class="p-4 border-t border-surface-300 dark:border-surface-700 flex justify-end gap-2 bg-surface-50 dark:bg-surface-900">
				<Button variant="ghost" onclick={() => (showModal = false)} aria-label="Cancel editing">Cancel</Button>
				<Button variant="tertiary" disabled={isSaving} onclick={saveWebhook} aria-label="Save webhook" class="dark:" loading={isSaving}>
					{#if !isSaving}
						<iconify-icon icon="mdi:content-save"></iconify-icon>
					{/if}
					<span>{isSaving ? 'Saving...' : activeWebhook.id ? 'Save Changes' : 'Create Webhook'}</span>
				</Button>
			</footer>
		</AdminCard>
		</div>
	</div>
{/if}
