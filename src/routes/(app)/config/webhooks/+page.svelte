<!--
@file src/routes/(app)/config/webhooks/+page.svelte
@component
**Webhook management** — list, create/edit modal, test, delete with confirm.

Reference route for Testing 2026 ADR: thin UI over webhooks-api + webhooks-utils.

### Features:
- Admin-only (page.server gate)
- Client validation via webhooks-utils
- Mutations via webhooks-api → fetchApi (CSRF automatic)
- showConfirm for delete (no window.confirm)
- Control-risk data-testids only (golden E2E anchors)
-->
<script lang="ts">
import type { Webhook } from "@src/services/background/webhook-service";
import { toast } from "@src/stores/toast.svelte.ts";
import { showConfirm } from "@utils/modal.svelte";
import { onMount } from "svelte";
import { fade, slide } from "svelte/transition";
import Badge from "@components/ui/badge.svelte";
import Button from "@components/ui/button.svelte";
import Checkbox from "@components/ui/checkbox.svelte";
import Input from "@components/ui/input.svelte";
import Loader from "@components/ui/loader.svelte";
import AdminCard from "@components/admin-card.svelte";
import AdminPageShell from "@components/admin-page-shell.svelte";
import {
	WEBHOOK_EVENT_TYPES,
	filterWebhooksByQuery,
	validateWebhookDraft,
	type WebhookDraft,
} from "./webhooks-utils";
import {
	deleteWebhook as apiDeleteWebhook,
	listWebhooks,
	saveWebhook as apiSaveWebhook,
	testWebhookDelivery,
	unwrapWebhookList,
} from "./webhooks-api";

let webhooks: Webhook[] = $state([]);
let isLoading = $state(true);
let isSaving = $state(false);
let showModal = $state(false);
let editingWebhook: Partial<Webhook> | null = $state(null);
let formErrors = $state<Record<string, string>>({});
let searchQuery = $state("");

const filteredWebhooks = $derived(filterWebhooksByQuery(webhooks, searchQuery));

async function loadWebhooks() {
	isLoading = true;
	try {
		const result = await listWebhooks();
		if (result.success) {
			webhooks = unwrapWebhookList(result);
		} else {
			toast.error(result.message || "Failed to load webhooks");
		}
	} catch {
		toast.error("Error loading webhooks");
	} finally {
		isLoading = false;
	}
}

async function saveWebhook() {
	if (!editingWebhook) return;
	const draft: WebhookDraft = {
		id: editingWebhook.id,
		name: editingWebhook.name || "",
		url: editingWebhook.url || "",
		active: editingWebhook.active !== false,
		events: (editingWebhook.events as string[]) || [],
		secret: editingWebhook.secret,
	};
	const errors = validateWebhookDraft(draft);
	formErrors = errors;
	if (Object.keys(errors).length > 0) {
		toast.warning({ description: Object.values(errors)[0] });
		return;
	}

	isSaving = true;
	try {
		const result = await apiSaveWebhook({
			...editingWebhook,
			name: draft.name.trim(),
			url: draft.url.trim(),
			active: draft.active,
			events: draft.events as Webhook["events"],
			secret: draft.secret,
		});
		if (result.success) {
			toast.success(`Webhook ${draft.id ? "updated" : "created"} successfully`);
			showModal = false;
			formErrors = {};
			await loadWebhooks();
		} else {
			toast.error(result.message || "Failed to save webhook");
		}
	} catch {
		toast.error("Error saving webhook");
	} finally {
		isSaving = false;
	}
}

function confirmDelete(webhook: Webhook) {
	showConfirm({
		title: "Delete Webhook",
		body: `Delete webhook <strong>${webhook.name}</strong>? Outbound deliveries will stop.`,
		onConfirm: async () => {
			try {
				const result = await apiDeleteWebhook(webhook.id);
				if (result.success) {
					toast.success("Webhook deleted");
					await loadWebhooks();
				} else {
					toast.error(result.message || "Failed to delete");
				}
			} catch {
				toast.error("Error deleting webhook");
			}
		},
	});
}

async function testWebhook(webhook: Webhook) {
	toast.info(`Sending test payload to ${webhook.name}...`);
	try {
		const result = await testWebhookDelivery(webhook.id);
		if (result.success) {
			toast.success("Test webhook sent successfully!");
		} else {
			toast.error(result.message || "Webhook test failed");
		}
	} catch {
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
	formErrors = {};
	showModal = true;
}

function openEditModal(webhook: Webhook) {
	editingWebhook = { ...webhook };
	formErrors = {};
	showModal = true;
}

function toggleEvent(event: string) {
	if (!editingWebhook) return;
	const events = editingWebhook.events || [];
	if (events.includes(event as never)) {
		editingWebhook.events = events.filter((e) => e !== event);
	} else {
		editingWebhook.events = [...events, event as never];
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
		<div class="flex items-center gap-2">
			<Button
				variant="ghost"
				href="/config/webhooks/logs"
				data-preload="hover"
				data-testid="webhooks-logs-link"
				leadingIcon="mdi:clipboard-text-outline"
				size="sm"
			>
				Delivery Logs
			</Button>
			<Button
				variant="tertiary"
				onclick={openAddModal}
				aria-label="Add webhook"
				leadingIcon="mdi:plus"
				data-testid="webhooks-add"
			>
				Add Webhook
			</Button>
		</div>
	{/snippet}

	<div data-testid="webhooks-page" class="contents">
		{#if isLoading}
			<AdminCard class="p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/40 backdrop-blur-md shadow-xs">
				<div class="flex flex-col items-center justify-center py-20" data-testid="webhooks-loading">
					<Loader variant="text" lines={2} lastLineWidth="50%" ariaLabel="Loading webhooks" />
				</div>
			</AdminCard>
		{:else}
			{#if webhooks.length > 0}
				<div class="mb-4">
					<Input
						type="search"
						bind:value={searchQuery}
						placeholder="Search webhooks..."
						aria-label="Search webhooks"
						data-testid="webhooks-search"
						class="max-w-md"
					/>
				</div>
			{/if}

			{#if webhooks.length === 0}
				<div in:fade>
					<AdminCard
						class="p-12 text-center border-2 border-dashed border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-900/40 backdrop-blur-md shadow-xs"
						data-testid="webhooks-empty"
					>
						<iconify-icon icon="mdi:webhook-off" class="text-6xl mb-4 opacity-20"></iconify-icon>
						<h3 class="h3 font-bold">No Webhooks Configured</h3>
						<p class="mb-6 opacity-60">Add a webhook to start integrating with external systems.</p>
						<Button variant="tertiary" onclick={openAddModal} aria-label="Add webhook" data-testid="webhooks-empty-cta">
							Get Started
						</Button>
					</AdminCard>
				</div>
			{:else if filteredWebhooks.length === 0}
				<AdminCard class="p-8 text-center" data-testid="webhooks-search-empty">
					<p class="opacity-60">No webhooks match your search.</p>
				</AdminCard>
			{:else}
				<div in:fade>
					<AdminCard
						class="p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/40 backdrop-blur-md shadow-xs space-y-4"
						data-testid="webhooks-list"
					>
						<div class="grid gap-4">
							{#each filteredWebhooks as webhook (webhook.id)}
								<AdminCard
									class="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-tertiary-500 dark:hover:border-primary-500 transition-colors"
									data-testid={`webhook-card-${webhook.id}`}
									data-webhook-name={webhook.name}
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
										<Button
											variant="surface"
											onclick={() => testWebhook(webhook as Webhook)}
											title="Send Test Event"
											aria-label="Test webhook {webhook.name}"
											data-testid="webhook-test"
											size="sm"
										>
											<iconify-icon icon="mdi:send-outline"></iconify-icon>
											<span class="hidden sm:inline">Test</span>
										</Button>
										<Button
											variant="surface"
											onclick={() => openEditModal(webhook)}
											title="Edit Configuration"
											aria-label="Edit webhook {webhook.name}"
											data-testid="webhook-edit"
											size="sm"
										>
											<iconify-icon icon="mdi:pencil-outline"></iconify-icon>
											<span class="hidden sm:inline">Edit</span>
										</Button>
										<Button
											variant="error"
											onclick={() => confirmDelete(webhook)}
											title="Delete Webhook"
											aria-label="Delete webhook {webhook.name}"
											data-testid="webhook-delete"
											size="sm"
										>
											<iconify-icon icon="mdi:trash-can-outline"></iconify-icon>
										</Button>
									</div>
								</AdminCard>
							{/each}
						</div>
					</AdminCard>
				</div>
			{/if}
		{/if}
	</div>
</AdminPageShell>

{#if showModal && editingWebhook}
	{@const activeWebhook = editingWebhook}
	<div
		class="fixed inset-0 z-1000 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
		transition:fade
		role="presentation"
		data-testid="webhooks-modal-backdrop"
	>
		<div transition:slide class="w-full max-w-2xl">
			<AdminCard
				class="bg-surface-100 dark:bg-surface-800 w-full overflow-hidden shadow-2xl border border-surface-300 dark:border-surface-700"
				role="dialog"
				aria-modal="true"
				aria-labelledby="webhook-modal-title"
				data-testid="webhooks-modal"
			>
				<header class="p-4 border-b border-surface-300 dark:border-surface-700 flex justify-between items-center bg-surface-200 dark:bg-surface-900">
					<h3 id="webhook-modal-title" class="h3 font-bold">
						{activeWebhook.id ? "Edit Webhook" : "Add New Webhook"}
					</h3>
					<Button
						variant="ghost"
						onclick={() => (showModal = false)}
						aria-label="Close modal"
						size="sm"
						data-testid="webhook-modal-close"
					>
						<iconify-icon icon="mdi:close" class="text-xl"></iconify-icon>
					</Button>
				</header>

				<section class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
					<Input
						label="Webhook Name"
						type="text"
						placeholder="e.g. My External API"
						bind:value={activeWebhook.name}
						error={formErrors.name}
						data-testid="webhook-name"
					/>

					<Input
						label="Payload URL"
						type="url"
						placeholder="https://example.com/webhook"
						bind:value={activeWebhook.url}
						error={formErrors.url}
						data-testid="webhook-url"
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
									data-testid="webhook-secret"
								/>
								<Button
									variant="ghost"
									onclick={() => activeWebhook && (activeWebhook.secret = crypto.randomUUID().replace(/-/g, ""))}
									aria-label="Regenerate secret"
									size="sm"
									data-testid="webhook-regenerate-secret"
								>
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

					<div class="space-y-2" data-testid="webhook-events">
						<span class="block font-bold">Trigger Events</span>
						{#if formErrors.events}
							<p class="text-sm text-error-500" role="alert">{formErrors.events}</p>
						{/if}
						<p class="text-xs opacity-60 mb-2">Select which events should trigger this webhook.</p>
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
							{#each WEBHOOK_EVENT_TYPES as event (event)}
								<div class="hover:bg-surface-200 dark:hover:bg-surface-700 p-2 rounded transition-colors">
									<Checkbox
										checked={activeWebhook.events?.includes(event as never) ?? false}
										onchange={() => toggleEvent(event)}
										label={event}
									/>
								</div>
							{/each}
						</div>
					</div>
				</section>

				<footer class="p-4 border-t border-surface-300 dark:border-surface-700 flex justify-end gap-2 bg-surface-50 dark:bg-surface-900">
					<Button variant="ghost" onclick={() => (showModal = false)} aria-label="Cancel editing" data-testid="webhook-cancel">
						Cancel
					</Button>
					<Button
						variant="tertiary"
						disabled={isSaving}
						onclick={saveWebhook}
						aria-label="Save webhook"
						loading={isSaving}
						data-testid="webhook-save"
					>
						{#if !isSaving}
							<iconify-icon icon="mdi:content-save"></iconify-icon>
						{/if}
						<span>{isSaving ? "Saving..." : activeWebhook.id ? "Save Changes" : "Create Webhook"}</span>
					</Button>
				</footer>
			</AdminCard>
		</div>
	</div>
{/if}
