<!--
@file src/routes/(app)/config/redirects/+page.svelte
@component
**Redirect Management GUI** — list, search, create/edit modal, delete with confirm.

### Features:
- Admin-only shell with stable data-testids
- Client search filter via redirects-utils
- showConfirm for destructive delete (no window.confirm)
- invalidateAll after mutations (no full page reload)
-->

<script lang="ts">
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import { deleteRedirect, saveRedirect } from './redirects.remote';
	import { toast } from '@src/stores/toast.svelte';
	import { button_save } from '@src/paraglide/messages';
	import { showConfirm } from '@utils/modal.svelte';
	import { invalidateAll } from '$app/navigation';
	import {
		filterRedirectsByQuery,
		toRedirectPayload,
		validateRedirectDraft,
		type RedirectDraft,
	} from './redirects-utils';

	let { data } = $props();
	let redirects = $derived((data.redirects || []) as Array<RedirectDraft & { _id?: string }>);

	let searchQuery = $state('');
	let filteredRedirects = $derived(filterRedirectsByQuery(redirects, searchQuery));

	let selectedRedirect = $state<(RedirectDraft & { _id?: string }) | null>(null);
	let isModalOpen = $state(false);
	let formErrors = $state<Record<string, string>>({});
	let saving = $state(false);

	const redirectTypeOptions = [
		{ value: '301', label: '301 Permanent' },
		{ value: '302', label: '302 Temporary' },
		{ value: '307', label: '307 Temporary (keep method)' },
		{ value: '308', label: '308 Permanent (keep method)' },
	];

	const statusOptions = [
		{ value: 'true', label: 'Active' },
		{ value: 'false', label: 'Inactive' },
	];

	function openModal(redirect: (RedirectDraft & { _id?: string }) | null = null) {
		selectedRedirect = redirect
			? {
					id: redirect._id || redirect.id,
					_id: redirect._id,
					from: redirect.from,
					to: redirect.to,
					type: redirect.type ?? 301,
					active: redirect.active !== false,
					isRegex: Boolean(redirect.isRegex),
				}
			: { from: '', to: '', type: 301, active: true, isRegex: false };
		formErrors = {};
		isModalOpen = true;
	}

	function closeModal() {
		isModalOpen = false;
		selectedRedirect = null;
		formErrors = {};
		saving = false;
	}

	async function handleSave(e: Event) {
		e.preventDefault();
		if (!selectedRedirect) return;

		const draft: RedirectDraft = {
			id: selectedRedirect._id || selectedRedirect.id,
			from: selectedRedirect.from,
			to: selectedRedirect.to,
			type: selectedRedirect.type,
			active: selectedRedirect.active,
			isRegex: selectedRedirect.isRegex,
		};
		const payload = toRedirectPayload(draft);
		const errors = validateRedirectDraft(payload);
		formErrors = errors;
		if (Object.keys(errors).length > 0) {
			toast.error({ description: Object.values(errors)[0] });
			return;
		}

		saving = true;
		try {
			await saveRedirect({
				id: payload.id,
				from: payload.from,
				to: payload.to,
				type: payload.type,
				active: payload.active,
				isRegex: payload.isRegex,
			});
			toast.success({ description: 'Redirect saved' });
			closeModal();
			await invalidateAll();
		} catch (err) {
			toast.error({
				description: err instanceof Error ? err.message : 'Failed to save redirect',
			});
		} finally {
			saving = false;
		}
	}

	function confirmDelete(redirect: RedirectDraft & { _id?: string }) {
		const id = redirect._id || redirect.id;
		if (!id) return;
		showConfirm({
			title: 'Delete Redirect',
			body: `Delete redirect from <strong>${redirect.from}</strong> to <strong>${redirect.to}</strong>? This cannot be undone.`,
			onConfirm: async () => {
				try {
					await deleteRedirect(id);
					toast.success({ description: 'Redirect deleted' });
					await invalidateAll();
				} catch (err) {
					toast.error({
						description: err instanceof Error ? err.message : 'Failed to delete redirect',
					});
				}
			},
		});
	}
</script>

<AdminPageShell
	title="Redirect Manager"
	icon="mdi:arrow-decision"
	description="Manage your site redirects globally"
	showBackButton={true}
	backUrl="/config"
>
	{#snippet actions()}
		<Button
			variant="tertiary"
			onclick={() => openModal()}
			leadingIcon="mdi:plus"
			data-testid="redirects-add"
			aria-label="Add redirect"
		>
			Add Redirect
		</Button>
	{/snippet}

	<div data-testid="redirects-page" class="contents">
		<AdminCard
			class="space-y-4 border border-surface-200 bg-white p-6 shadow-xs backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/40"
		>
			<div class="relative">
				<iconify-icon
					icon="mdi:magnify"
					class="pointer-events-none absolute inset-s-3 top-1/2 z-10 -translate-y-1/2 text-xl opacity-50"
					aria-hidden="true"
				></iconify-icon>
				<Input
					type="search"
					bind:value={searchQuery}
					placeholder="Search by path..."
					aria-label="Search redirects by path"
					data-testid="redirects-search"
					class="ps-10 w-full"
				/>
			</div>

			<p class="text-xs text-surface-500" data-testid="redirects-count">
				{filteredRedirects.length}
				{filteredRedirects.length === 1 ? 'redirect' : 'redirects'}
				{#if searchQuery.trim()}
					matching “{searchQuery.trim()}”
				{/if}
			</p>

			<div class="w-full overflow-x-auto" data-testid="redirects-table">
				<table class="w-full border-collapse text-sm">
					<thead>
						<tr
							class="border-b border-surface-200 text-start text-xs uppercase tracking-wider text-surface-400 dark:border-surface-800"
						>
							<th class="pb-3 font-semibold">From Path</th>
							<th class="pb-3 font-semibold">To Path</th>
							<th class="pb-3 font-semibold">Type</th>
							<th class="pb-3 font-semibold">Status</th>
							<th class="pb-3 font-semibold">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-surface-100 dark:divide-surface-800/60">
						{#each filteredRedirects as redirect (redirect._id || redirect.from + redirect.to)}
							<tr
								class="text-surface-700 hover:bg-surface-50/40 dark:text-surface-200 dark:hover:bg-surface-900/30"
								data-testid={`redirect-row-${redirect._id || 'new'}`}
								data-from={redirect.from}
							>
								<td class="py-3 font-mono text-xs">{redirect.from}</td>
								<td class="py-3 font-mono text-xs">{redirect.to}</td>
								<td class="py-3">
									<Badge variant={redirect.type === 301 || redirect.type === 308 ? 'success' : 'warning'}>
										{redirect.type}
									</Badge>
								</td>
								<td class="py-3">
									{#if redirect.active}
										<Badge variant="primary">Active</Badge>
									{:else}
										<Badge variant="surface">Inactive</Badge>
									{/if}
								</td>
								<td class="py-3">
									<div class="flex gap-2">
										<Button
											variant="outline"
											onclick={() => openModal(redirect)}
											aria-label="Edit redirect {redirect.from}"
											data-testid="redirect-edit"
											class="p-0! min-w-0"
										>
											<iconify-icon icon="mdi:pencil"></iconify-icon>
										</Button>
										<Button
											variant="error"
											aria-label="Delete redirect {redirect.from}"
											data-testid="redirect-delete"
											onclick={() => confirmDelete(redirect)}
											class="p-0! min-w-0"
										>
											<iconify-icon icon="mdi:trash-can"></iconify-icon>
										</Button>
									</div>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="5" class="py-12 text-center opacity-50" data-testid="redirects-empty">
									{#if searchQuery.trim()}
										No redirects match your search.
									{:else}
										No redirects yet. Add one to map old paths to new destinations.
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</AdminCard>
	</div>
</AdminPageShell>

{#if isModalOpen && selectedRedirect}
	<div
		class="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-surface-900/50 p-4 backdrop-blur"
		role="presentation"
		data-testid="redirects-modal-backdrop"
	>
		<AdminCard
			class="w-full max-w-lg space-y-4 border border-surface-200 bg-white p-6 shadow-xl backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/40"
			role="dialog"
			aria-modal="true"
			aria-labelledby="redirect-modal-title"
			data-testid="redirects-modal"
		>
			<h3 id="redirect-modal-title" class="h3">
				{selectedRedirect._id || selectedRedirect.id ? 'Edit' : 'Add'} Redirect
			</h3>

			<form onsubmit={handleSave} class="space-y-4" data-testid="redirects-form">
				<Input
					label="From Path (e.g. /old-blog)"
					bind:value={selectedRedirect.from}
					required
					error={formErrors.from}
					data-testid="redirect-from"
					aria-label="From path"
				/>
				<Input
					label="To Path (e.g. /new-blog or https://example.com/new)"
					bind:value={selectedRedirect.to}
					required
					error={formErrors.to}
					data-testid="redirect-to"
					aria-label="To path"
				/>

				<div class="grid grid-cols-2 gap-4" data-testid="redirect-type-status">
					<Select
						label="Redirect Type"
						value={String(selectedRedirect.type)}
						options={redirectTypeOptions}
						onchange={(v) => (selectedRedirect!.type = parseInt(v, 10))}
					/>
					<Select
						label="Status"
						value={selectedRedirect.active ? 'true' : 'false'}
						options={statusOptions}
						onchange={(v) => (selectedRedirect!.active = v === 'true')}
					/>
				</div>

				<div data-testid="redirect-regex">
					<Checkbox bind:checked={selectedRedirect.isRegex} label="Is Regex / Pattern" />
				</div>

				<div class="flex justify-end gap-2 pt-4">
					<Button
						variant="outline"
						type="button"
						onclick={closeModal}
						disabled={saving}
						data-testid="redirect-cancel"
					>
						Cancel
					</Button>
					<Button
						variant="tertiary"
						type="submit"
						disabled={saving}
						data-testid="redirect-save"
					>
						{saving ? 'Saving...' : button_save()}
					</Button>
				</div>
			</form>
		</AdminCard>
	</div>
{/if}
